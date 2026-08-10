# Archiver Viewer — Beamline Installation Guide

## What you need on the beamline machine

- Python 3.9 or later (Anaconda is fine)
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

## 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

If you are in a restricted environment without internet access, install on a connected
machine first and copy the packages, or use a local conda channel.

---

## 3. Verify it works (quick test)

```bash
python app.py
```

Open a browser on the beamline machine and go to:

```
http://localhost:8080
```

You should see the PV browser with all archived PVs loaded.
Press **Ctrl+C** to stop after testing.

---

## 4. Configure archiver URLs (if different from defaults)

The defaults are already set for APS Sector 15:

| Variable               | Default                        |
|------------------------|--------------------------------|
| `ARCHIVER_MGMT_URL`    | `http://164.54.169.92:17665`   |
| `ARCHIVER_RETRIEVAL_URL` | `http://164.54.169.92:17668` |
| `PORT`                 | `8080`                         |
| `CONFIG_PATH`          | `config/overrides.json`        |

To override, either export environment variables before running, or edit them
directly in the `archiver-viewer.service` file (see step 5).

---

## 5. Install as a systemd service (auto-start on boot)

### 5a. Edit the service file

Open `archiver-viewer.service` and update these two lines to match your system:

```ini
User=beamline                          # ← the Linux user account that runs the app
WorkingDirectory=/opt/archiver-viewer  # ← full path to where you cloned the repo
ExecStart=/opt/anaconda3/bin/python app.py  # ← full path to your Python binary
```

Find your Python path with:

```bash
which python   # or: which python3
```

### 5b. Copy and enable the service

```bash
# Copy the repo to the permanent install location
sudo cp -r . /opt/archiver-viewer
sudo chown -R beamline:beamline /opt/archiver-viewer

# Install the systemd unit
sudo cp /opt/archiver-viewer/archiver-viewer.service /etc/systemd/system/archiver-viewer.service
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

Open a browser and go to:

```
http://<beamline-machine-hostname>:8080
```

or from the beamline machine itself:

```
http://localhost:8080
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
cd /opt/archiver-viewer
git pull
pip install -r requirements.txt   # in case dependencies changed
sudo systemctl restart archiver-viewer
```

### Edit the PV grouping config

The config file lives at `/opt/archiver-viewer/config/overrides.json` (or `CONFIG_PATH`).
You can edit it:
- **From the web UI** — click **⊞ Groups** or **⚙ JSON** in the header and save.
  Changes take effect immediately without restarting.
- **By hand** — edit `config/overrides.json` with any text editor.
  Changes take effect immediately (the backend reads the file on each request).

---

## Rebuilding the frontend (developers only)

Only needed if you modify the React source code in `frontend/src/`.
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

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Blank page or JS error | Run `python app.py` manually and look at the console output |
| "Could not reach archiver" in sidebar | Verify `ARCHIVER_MGMT_URL` is reachable: `curl http://164.54.169.92:17665/mgmt/bpl/getApplianceInfo` |
| Port 8080 already in use | Change `PORT` env var in `archiver-viewer.service` and restart |
| Service won't start | Check `journalctl -u archiver-viewer -n 50` for the error |
| PVs missing after adding them in AA | Refresh the browser — the PV list is fetched fresh on each page load |
