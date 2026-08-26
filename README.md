# Archiver Viewer

A web-based browser and plotter for EPICS Archiver Appliance (AA) data, designed for beamline PV monitoring.
Browse PVs grouped by experimental station and device, select multiple PVs, and plot them interactively with Plotly.

**GitHub:** https://github.com/nayanbera/archiver-viewer

---

## Features

### PV Browser (sidebar)
- Collapsible tree: Station → Device → PV
- Multi-select with cascading checkboxes (select an entire device or station at once)
- Three search modes accessible from the sidebar:
  - **Filter** — live tree filter as you type
  - **Glob** — pattern search against the archiver (`15IDA:*`, `*:M1:*`, `*BeamPos*`)
  - **Regex** — case-insensitive local regex filter (`.*:M\d+:.*`)

### Interactive Plotly Chart
- Step-style line plot (hold-until-change), one trace per PV, colour-coded
- **Time presets** — 5 m, 15 m, 1 h, 8 h, 24 h, 7 d, 30 d, 3 mo, 6 mo, 1 y; clicking a preset auto-plots immediately
- Custom date/time range pickers
- Zoom (scroll wheel or box-select), pan (drag), and X-axis sync back to the time bar
- **Fast / Raw toggle** — Fast mode uses AA's `mean_N` operator to return ~1 200 representative points (same speed as the native AA viewer); Raw mode fetches every archived sample. Point count shown live in the toolbar.
- **Lin Y / Log Y toggle** — switch Y-axis between linear and logarithmic scale
- **📋 Table view** — toggle between chart and a scrollable wide-format data table (same layout as the CSV export). PV column headers are colour-coded to match chart traces; missing values shown as `—`. Switching back to the chart requires no re-fetch.
- **● Live mode** — click **Live** in the toolbar to enter a rolling 2-minute window that auto-refreshes every 5 s. A pulsing green indicator confirms live mode is active. Clicking a time preset or **▶ Plot** exits live mode and returns to the selected time range.
- Export plotted data as **CSV** (matches plot decimation by default; tick *Export all raw samples* for full resolution)

### Annotations
- **Double-click** anywhere on the plot to open the annotation form at that timestamp
- Annotations are stored in `config/overrides.json` and persist across sessions
- Each annotation records: note text, timestamp, plotted PVs, and time range
- Clicking an annotation in the sidebar restores the exact plot view and marks the timestamp with a vertical dashed line
- **Search** annotations by note text or timestamp (live, case-insensitive)
- **Edit** (✏) and **Delete** (✕) buttons appear on hover; both require the annotation password if one is set
- Password management via the 🔓/🔒 icon in the panel header (set, change, or remove the password without editing JSON)

### Other
- **AA Viewer tab** — original Archiver Appliance iframe is preserved and accessible via the Plotly / AA Viewer toggle
- **⊞ Groups** — rename stations, reassign non-standard PVs, tag device types
- **⚙ JSON** — raw config editor for power users
- One-click link to the AA management page

---

## Deploying on the beamline computer

### Prerequisites

- Python 3.9 or later (Anaconda recommended)
- Git
- Network access to the Archiver Appliance

Node.js is **not** required on the beamline machine — the pre-built frontend is included in the repository.

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/nayanbera/archiver-viewer.git
cd archiver-viewer
```

---

### Step 2 — Create the conda environment

```bash
conda env create -f environment.yml
```

This creates an environment named **`archiver-viewer`** with Python 3.11 and all dependencies.
Only needs to be done once. To update dependencies later:

```bash
conda env update -f environment.yml --prune
```

---

### Step 3 — Test it manually

```bash
conda activate archiver-viewer
python app.py
```

Open a browser and go to `http://localhost:8080`.
You should see the PV browser with all archived PVs loaded.
Press **Ctrl+C** to stop.

---

### Step 4 — Install as a systemd service (auto-start on boot)

**4a. Edit `archiver-viewer.service`** — update these lines to match your system:

```ini
User=chem_epics                                                                    # Linux user that runs the app
WorkingDirectory=/usr/local/epics/archiver-viewer                                  # full path to the cloned repo
ExecStart=/home/chem_epics/anaconda3/envs/archiver-viewer/bin/python app.py       # Python inside the conda env
Environment="CONFIG_PATH=/usr/local/epics/archiver-viewer/config/overrides.json"  # config file location
```

Find the exact path to the conda env's Python with:

```bash
conda activate archiver-viewer
which python
```

**4b. Copy the repo and install the service:**

```bash
# Copy repo to permanent location
sudo cp -r . /usr/local/epics/archiver-viewer
sudo chown -R chem_epics:chem_epics /usr/local/epics/archiver-viewer

# Install and enable the systemd service
sudo cp /usr/local/epics/archiver-viewer/archiver-viewer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable archiver-viewer    # start automatically on every boot
sudo systemctl start archiver-viewer     # start right now
```

**4c. Verify it is running:**

```bash
sudo systemctl status archiver-viewer
```

You should see `Active: active (running)`.

---

### Step 5 — Access the app

From the beamline machine:
```
http://localhost:8080
```

From another machine on the beamline network:
```
http://<beamline-machine-hostname>:8080
```

---

## Configuration

### Environment variables

Set in `archiver-viewer.service` (or exported before running manually):

| Variable                  | Default                         | Description                        |
|---------------------------|---------------------------------|------------------------------------|
| `ARCHIVER_MGMT_URL`       | `http://164.54.169.92:17665`    | AA management port                 |
| `ARCHIVER_RETRIEVAL_URL`  | `http://164.54.169.92:17668`    | AA retrieval port                  |
| `PORT`                    | `8080`                          | HTTP port the app listens on       |
| `CONFIG_PATH`             | `config/overrides.json`         | Path to the persistent config file |

### Config file (`overrides.json`)

Edited from the web UI (**⊞ Groups** or **⚙ JSON**) or directly on disk.
Changes take effect immediately — no restart needed.

Key fields:

| Field                | Type     | Description                                      |
|----------------------|----------|--------------------------------------------------|
| `pvOverrides`        | object   | Manual PV → station/device/label assignments     |
| `stationLabels`      | object   | Human-readable station name overrides            |
| `deviceTypes`        | object   | Device type tags                                 |
| `hiddenPVs`          | array    | PVs hidden from the browser tree                 |
| `annotations`        | array    | Saved plot annotations (managed via the UI)      |
| `annotationPassword` | string   | Password protecting annotation edit/delete (`""` = no protection) |
| `viewerBaseUrl`      | string   | Base URL for the AA iframe viewer                |

#### Setting the annotation password

Click the **🔓** icon in the Annotations panel header.
Enter a new password and confirm it — no current password is needed when setting one for the first time.
To change it later, click **🔒** and provide the current password first.
To remove protection, leave the new password blank.

---

## Day-to-day operations

### Stop / Start / Restart

```bash
sudo systemctl stop archiver-viewer
sudo systemctl start archiver-viewer
sudo systemctl restart archiver-viewer
```

### View live logs

```bash
journalctl -u archiver-viewer -f
```

### Update to a newer version

```bash
cd /usr/local/epics/archiver-viewer
git pull
sudo systemctl restart archiver-viewer
```

---

## Troubleshooting

| Symptom | What to check |
|---------|---------------|
| Blank page | Run `python app.py` manually and look at terminal output |
| "Could not reach archiver" in sidebar | `curl http://164.54.169.92:17665/mgmt/bpl/getApplianceInfo` |
| Port 8080 already in use | Change `PORT=` in `archiver-viewer.service` and restart |
| Service won't start | `journalctl -u archiver-viewer -n 50` |
| PVs missing after adding in AA | Refresh the browser — PV list is fetched fresh on each page load |
| Plot shows no data for long time ranges | Check AA logs; try Raw mode to verify raw data is accessible |
| Fast and Raw look identical | Expected for short ranges (< ~30 min) where no decimation is needed; check the point count shown in the toolbar |

---

## Development (modifying the frontend)

Only needed if you want to change the React source code.
Requires Node.js 16+ (`conda install -c conda-forge nodejs`).

```bash
# Install dependencies
cd frontend
npm install

# Start dev server (hot reload, proxies /api to localhost:5050)
npm run dev

# Build production bundle → writes to ../static/
npm run build
git add ../static
git commit -m "Rebuild frontend"
git push
```

Run the FastAPI backend separately during development:

```bash
PORT=5050 python app.py
```

---

## API reference

The backend exposes these endpoints (all proxied from the browser via the same origin):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pvs` | GET | List all archived PVs |
| `/api/data` | GET | Fetch PV samples for Plotly and the table view. Params: `pv=` (repeatable), `from=`, `to=` (ISO 8601), `points=` (default 1200), `raw=true` |
| `/api/csv` | GET | Same data as `/api/data` but returned as a wide-format CSV. Supports the same `points` and `raw` params |
| `/api/search` | GET | Glob search against the archiver. Param: `pattern=` |
| `/api/config` | GET / POST | Read or write `overrides.json` |

### Data decimation

`/api/data` and `/api/csv` use AA's `mean_N` post-processor by default, where *N* (seconds per bin) is computed as `floor(range_seconds / points)`. This matches the strategy used by the native AA viewer and keeps response times fast for long time ranges.

Pass `raw=true` to retrieve every archived sample. This can be slow for ranges longer than a few hours depending on the PV's archive rate.
