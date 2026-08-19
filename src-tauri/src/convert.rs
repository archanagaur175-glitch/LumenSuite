use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::engine::{ensure_profile_dir, soffice_binary, state_paths};
use crate::result::{to_unix_file_url, CommandResult};

pub struct ConvertLock(pub Mutex<()>);

fn filter_for(ext: &str) -> Option<&'static str> {
    match ext {
        "docx" => Some("docx:MS Word 2007 XML"),
        "odt" => Some("odt:writer8"),
        "xlsx" => Some("xlsx:Calc MS Excel 2007 XML"),
        "ods" => Some("ods:calc8"),
        "pptx" => Some("pptx:Impress MS PowerPoint 2007 XML"),
        "odp" => Some("odp:impress8"),
        "pdf" => Some("pdf"),
        _ => None,
    }
}

#[derive(Serialize)]
pub struct ConvertOutcome {
    pub path: String,
}

fn convert_one(
    bin: &Path,
    profile: &Path,
    input: &Path,
    outdir: &Path,
    ext: &str,
) -> Result<PathBuf, String> {
    let filter = filter_for(ext).ok_or_else(|| format!("unsupported target extension: {}", ext))?;
    if !input.exists() {
        return Err(format!("input file not found: {}", input.display()));
    }
    std::fs::create_dir_all(outdir).map_err(|e| e.to_string())?;
    let profile_url = to_unix_file_url(profile);
    let filter_arg = if filter == "pdf" {
        "pdf".to_string()
    } else {
        filter.to_string()
    };
    let out = std::process::Command::new(bin)
        .arg("--headless")
        .arg("--invisible")
        .arg("--nologo")
        .arg("--nodefault")
        .arg("--norestore")
        .arg("--nolockcheck")
        .arg(format!("-env:UserInstallation={}", profile_url))
        .arg("--convert-to")
        .arg(filter_arg)
        .arg("--outdir")
        .arg(outdir)
        .arg(input)
        .output()
        .map_err(|e| format!("failed to run soffice: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "LibreOffice conversion failed ({}): {}",
            ext,
            stderr.trim().chars().take(400).collect::<String>()
        ));
    }
    let file_stem = input
        .file_stem()
        .ok_or_else(|| "input has no file name".to_string())?
        .to_string_lossy()
        .to_string();
    let output_path = outdir.join(format!("{}.{}", file_stem, ext));
    if !output_path.exists() {
        return Err(format!(
            "conversion completed but output missing: {}",
            output_path.display()
        ));
    }
    Ok(output_path)
}

#[tauri::command]
pub fn convert_file(
    app: AppHandle,
    lock: State<'_, ConvertLock>,
    input_path: String,
    out_dir: String,
    target_ext: String,
) -> CommandResult<ConvertOutcome> {
    let ext = target_ext.trim().trim_start_matches('.').to_lowercase();
    if filter_for(&ext).is_none() {
        return CommandResult::err(format!(
            "unsupported target extension: {} (expected docx/odt/xlsx/ods/pptx/odp/pdf)",
            ext
        ));
    }
    let bin = match soffice_binary(&app) {
        Some(b) => b,
        None => return CommandResult::err("LibreOffice engine is not bundled with this build"),
    };
    let profile = match ensure_profile_dir(&app) {
        Ok(p) => p,
        Err(e) => return CommandResult::err(e),
    };
    let input = PathBuf::from(&input_path);
    let outdir = PathBuf::from(&out_dir);
    let res = {
        let _g = lock.0.lock().unwrap();
        convert_one(&bin, &profile, &input, &outdir, &ext)
    };
    match res {
        Ok(path) => CommandResult::ok(ConvertOutcome {
            path: path.to_string_lossy().to_string(),
        }),
        Err(e) => CommandResult::err(e),
    }
}

#[tauri::command]
pub fn app_dirs(app: AppHandle) -> CommandResult<crate::engine::AppDirs> {
    match state_paths(&app) {
        Ok((recovery_dir, working_dir, bundles_root)) => {
            CommandResult::ok(crate::engine::AppDirs {
                recovery_dir: recovery_dir.to_string_lossy().to_string(),
                working_dir: working_dir.to_string_lossy().to_string(),
                lo_bundle_root: bundles_root.to_string_lossy().to_string(),
                profiles_dir: ensure_profile_dir(&app)
                    .map(|d| d.to_string_lossy().to_string())
                    .unwrap_or_default(),
            })
        }
        Err(e) => CommandResult::err(e),
    }
}
