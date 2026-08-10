# Archiver Viewer

A web-based browser for EPICS Archiver Appliance data, designed for beamline PV monitoring.  
Browse PVs grouped by experimental station and device, select multiple PVs, and plot them in the Archiver Appliance viewer.

**GitHub:** https://github.com/nayanbera/archiver-viewer

---

## Features

- Collapsible tree: Station → Device → PV
- Multi-select with cascading checkboxes (select a whole device or station at once)
- Live filter / search across all PV names
- Pattern search against the archiver (`15IDA:*`, `*:M1:*`, `*BeamPos*`)
- Embedded Archiver Viewer iframe with time range controls
- Manual group overrides — rename stations, reassign non-standard PVs, tag device types
- One-click link to the AA management page to add new PVs to the archiver

---

## Deploying on the beamline computer

### Prerequisites

- Python 3.9 or later (Anaconda is fine)
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

**4a. Edit `arviewer.service`** — update these three lines to match your system:

```ini
User=beamline                                                        # Linux user that runs the app
WorkingDirectory=/opt/archiver-viewer                                # full path to the cloned repo
ExecStart=/opt/anaconda3/envs/archiver-viewer/bin/python app.py     # Python inside the conda env
```

Find the exact path to the conda env's Python with:

```bash
conda activate archiver-viewer
which python
```

**4b. Copy the repo and install the service:**

```bash
# Copy repo to permanent location
sudo cp -r . /opt/archiver-viewer
sudo chown -R beamline:beamline /opt/archiver-viewer

# Install and enable the systemd service
sudo cp /opt/archiver-viewer/arviewer.service /etc/systemd/system/arviewer.service
sudo systemctl daemon-reload
sudo systemctl enable arviewer    # start automatically on every boot
sudo systemctl start arviewer     # start right now
```

**4c. Verify it is running:**

```bash
sudo systemctl status arviewer
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

Archiver URLs are set via environment variables in `arviewer.service`:

| Variable                 | Default                          |
|--------------------------|----------------------------------|
| `ARCHIVER_MGMT_URL`      | `http://164.54.169.92:17665`     |
| `ARCHIVER_RETRIEVAL_URL` | `http://164.54.169.92:17668`     |
| `PORT`                   | `8080`                           |
| `CONFIG_PATH`            | `config/overrides.json`          |

PV grouping overrides (station labels, device types, manual PV assignments) are stored in `config/overrides.json` and can be edited from the web UI via the **⊞ Groups** or **⚙ JSON** buttons.

---

## Day-to-day operations

### Stop / Start / Restart

```bash
sudo systemctl stop arviewer
sudo systemctl start arviewer
sudo systemctl restart arviewer
```

### View live logs

```bash
journalctl -u arviewer -f
```

### Update to a newer version

```bash
cd /opt/archiver-viewer
git pull
conda env update -f environment.yml --prune
sudo systemctl restart arviewer
```

---

## Troubleshooting

| Symptom | What to check |
|---------|---------------|
| Blank page | Run `python app.py` manually and look at terminal output |
| "Could not reach archiver" in sidebar | `curl http://164.54.169.92:17665/mgmt/bpl/getApplianceInfo` |
| Port 8080 already in use | Change `PORT=` in `arviewer.service` and restart |
| Service won't start | `journalctl -u arviewer -n 50` |
| PVs missing after adding in AA | Refresh the browser — PV list is fetched fresh on each page load |

---

## Development (modifying the frontend)

Only needed if you want to change the React source code.  
Requires Node.js 16+ (`conda install -c conda-forge nodejs`).

```bash
# Install dependencies
cd frontend
npm install

# Start dev server (hot reload, proxies API to localhost:5050)
npm run dev

# Build production bundle → writes to ../static/
npm run build
git add ../static
git commit -m "Rebuild frontend"
git push
```

The FastAPI backend is in `app.py`. Run it separately during development:

```bash
PORT=5050 python app.py
```
