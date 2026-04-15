use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct Segment {
    #[serde(default)]
    pub id: u32,
    pub start: f64,
    pub end: f64,
    pub text: String,
}

fn fmt_srt_ts(seconds: f64) -> String {
    let s = seconds.max(0.0);
    let h = (s / 3600.0).floor() as u32;
    let m = ((s % 3600.0) / 60.0).floor() as u32;
    let sec = (s % 60.0).floor() as u32;
    let ms = ((s.fract()) * 1000.0).round() as u32;
    format!("{h:02}:{m:02}:{sec:02},{ms:03}")
}

fn fmt_vtt_ts(seconds: f64) -> String {
    let s = seconds.max(0.0);
    let h = (s / 3600.0).floor() as u32;
    let m = ((s % 3600.0) / 60.0).floor() as u32;
    let sec = (s % 60.0).floor() as u32;
    let ms = ((s.fract()) * 1000.0).round() as u32;
    format!("{h:02}:{m:02}:{sec:02}.{ms:03}")
}

pub fn segments_from_json(json: &str) -> Result<Vec<Segment>, String> {
    serde_json::from_str(json).map_err(|e| e.to_string())
}

pub fn to_srt(segments: &[Segment]) -> String {
    let mut out = String::new();
    let mut n = 1u32;
    for seg in segments {
        let text = seg.text.trim();
        if text.is_empty() {
            continue;
        }
        out.push_str(&n.to_string());
        n += 1;
        out.push('\n');
        out.push_str(&fmt_srt_ts(seg.start));
        out.push_str(" --> ");
        out.push_str(&fmt_srt_ts(seg.end));
        out.push('\n');
        out.push_str(text);
        out.push_str("\n\n");
    }
    out
}

pub fn to_vtt(segments: &[Segment]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    let mut n = 1u32;
    for seg in segments {
        let text = seg.text.trim();
        if text.is_empty() {
            continue;
        }
        out.push_str(&n.to_string());
        n += 1;
        out.push('\n');
        out.push_str(&fmt_vtt_ts(seg.start));
        out.push_str(" --> ");
        out.push_str(&fmt_vtt_ts(seg.end));
        out.push('\n');
        out.push_str(text);
        out.push_str("\n\n");
    }
    out
}

pub fn to_txt(segments: &[Segment]) -> String {
    segments
        .iter()
        .map(|s| s.text.trim())
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}
