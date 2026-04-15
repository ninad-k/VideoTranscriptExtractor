export default function Help() {
  return (
    <div className="panel" style={{ marginTop: "1.25rem" }}>
      <h2>Help</h2>
      <p className="hint">
        This app extracts transcripts fully offline. Typical flow:
      </p>
      <ol style={{ marginTop: 0, paddingLeft: "1.25rem" }}>
        <li>
          Click <b>Add videos</b> and select one or more files.
        </li>
        <li>
          Pick <b>Quality</b>:
          <ul>
            <li>
              <b>Draft</b>: faster, smaller model (good for quick review)
            </li>
            <li>
              <b>Final</b>: best accuracy, slower (recommended for delivery)
            </li>
          </ul>
        </li>
        <li>
          Pick <b>Language</b> hint (or keep <b>Auto</b> for Hinglish).
        </li>
        <li>
          Click <b>Start queue</b>. You can <b>Cancel</b> anytime.
        </li>
        <li>
          When done, open a completed job and use <b>Export</b> to SRT/VTT/TXT.
        </li>
      </ol>

      <h3 style={{ marginBottom: 6 }}>Tips</h3>
      <ul style={{ marginTop: 0, paddingLeft: "1.25rem" }}>
        <li>
          If you see a GPU out-of-memory error, switch to <b>Draft</b> quality or
          free VRAM.
        </li>
        <li>
          If FFmpeg is not found, install FFmpeg or set its path in{" "}
          <b>Settings</b>.
        </li>
        <li>
          Model downloads can be large; set a <b>Model cache directory</b> if you
          want them stored on a specific drive.
        </li>
      </ul>

      <h3 style={{ marginBottom: 6 }}>Keyboard</h3>
      <ul style={{ marginTop: 0, paddingLeft: "1.25rem" }}>
        <li>
          Click a job in the queue to view details. Use search in the transcript
          review area.
        </li>
      </ul>
    </div>
  );
}

