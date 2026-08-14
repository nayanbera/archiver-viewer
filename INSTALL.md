# Archiver Viewer — Beamline Installation Guide

## What you need on the beamline machine

- Python 3.9 or later (Anaconda recommended)
- Git
- Network access to the EPICS Archiver Appliance

Node.js is **not** required on the beamline machine.
The pre-built frontend is included in the repository.

---

## 1. Clone the repository

```bash
git clone https://github.com/nayanbera/archiver-viewer.git
cd archiver-viewer
```

---

## 2. Create the conda environment

```bash
conda env create -f environment.yml
```

Creates an environment named **`archiver-viewer`** with Python 3.11 and all required packages.
Only needs to be done once. To update later:

```bash
conda env update -f environment.yml --prune
```

---

## 3. Verify it works (quick test)

```bash
conda activate archiver-viewer
python app.py
```

Open a browser and go to `http://localhost:8080`.
You should see the PV browser with all archived PVs loaded.
Press **Ctrl+C** to stop after testing.

---

## 4. Configure archiver URLs (if different from defaults)

The defaults point to APS Sector 15:

| Variable                  | Default                         |
|---------------------------|---------------------------------|
| `ARCHIVER_MGMT_URL`       | `http://164.54.169.92:17665`    |
| `ARCHIVER_RETRIEVAL_URL`  | `http://164.54.169.92:17668`    |
| `PORT`                    | `8080`                          |
| `CONFIG_PATH`             | `config/overrides.json`         |

Set these in the `archiver-viewer.service` file (see step 5) or export them as environment variables before running.

---

## 5. Install as a systemd service (auto-start on boot)

### 5a. Edit the service file

Open `archiver-viewer.service` and update these lines to match your system:

```ini
User=chem_epics
WorkingDirectory=/usr/local/epics/archiver-viewer
ExecStart=/home/chem_epics/anaconda3/envs/archiver-viewer/bin/python app.py
Environment="CONFIG_PATH=/usr/local/epics/archiver-viewer/config/overrides.json"
```

Find your conda env's Python path with:

```bash
conda activate archiver-viewer
which python
```

### 5b. Copy and enable the service

```bash
# Copy the repo to the permanent install location
sudo cp -r . /usr/local/epics/archiver-viewer
sudo chown -R chem_epics:chem_epics /usr/local/epics/archiver-viewer

# Install the systemd unit
sudo cp /usr/local/epics/archiver-viewer/archiver-viewer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable archiver-viewer     # start automatically on every boot
sudo systemctl start archiver-viewer      # start right now
```

### 5c. Check it is running

```bash
sudo systemctl status archiver-viewer
```

You should see `Active: active (running)`.

### 5d. View live logs

```bash
journalctl -u archiver-viewer -f
```

---

## 6. Access the app

From the beamline machine:
```
http://localhost:8080
```

From another machine on the beamline network:
```
http://<beamline-machine-hostname>:8080
```

---

## Day-to-day operations

### Stop / Start / Restart

```bash
sudo systemctl stop archiver-viewer
sudo systemctl start archiver-viewer
sudo systemctl restart archiver-viewer
```

### Update to a newer version

```bash
cd /usr/local/epics/archiver-viewer
git pull
sudo systemctl restart archiver-viewer
```

*(Re-running `conda env update` is only needed if `environment.yml` changed.)*

### Edit the PV grouping config

The config file is at the path set by `CONFIG_PATH` (default `config/overrides.json`).

- **From the web UI** — click **⊞ Groups** or **⚙ JSON** in the header and save. Changes take effect immediately without restarting.
- **By hand** — edit the JSON file with any text editor. Changes take effect immediately.

### Set the annotation password

Click the **🔓** icon in the Annotations panel header (right sidebar).
Enter a new password and confirm it. To change it later, click **🔒** and provide the current password first.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Blank page or JS error | Run `python app.py` manually and watch the console |
| "Could not reach archiver" in sidebar | `curl http://164.54.169.92:17665/mgmt/bpl/getApplianceInfo` |
| Port 8080 already in use | Change `PORT` in `archiver-viewer.service` and restart |
| Service won't start (exit-code 217/USER) | Verify the `User=` line in the service file matches the actual Linux user |
| Service won't start (other) | `journalctl -u archiver-viewer -n 50` |
| PVs missing after adding them in AA | Refresh the browser — the PV list is fetched fresh on each page load |

---

## Rebuilding the frontend (developers only)

Only needed if you modify the React source in `frontend/src/`.
The beamline machine does **not** need this.

```bash
# Requires Node.js 16+ (install with: conda install -c conda-forge nodejs)
cd frontend
npm install
npm run build      # writes compiled files to ../static/
git add ../static
git commit -m "Rebuild frontend"
git push
```

Run the FastAPI backend on a different port during development:

```bash
PORT=5050 python app.py
```

The Vite dev server proxies `/api` requests to `localhost:5050` automatically.
