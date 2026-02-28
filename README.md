# Cockpit 🏎️

![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

A high-performance, synchronized Formula 1 race replay interface. This application ingests live GPS and vehicle telemetry data from the OpenF1 API, buffers it through a custom Python caching engine, and renders a millisecond-accurate 2D track map at 60 frames per second.

## ✨ Features

* **Data Interpolation Engine:** Bypasses low-frequency API updates (3Hz) by utilizing client-side Linear Interpolation (Lerp) to render smooth, 60fps vehicle movements on an HTML5 Canvas.
* **Smart Chunk-Loading & Caching:** A Flask middleware layer that pulls 15-minute data chunks and caches them in a local SQLite database, completely protecting the client from API rate limits and browser crashes.
* **Live Telemetry Dashboard:** Click on any driver on the live leaderboard to instantly monitor their Speed, Gear, RPM, Throttle, and Brake pressure perfectly synced to the master timeline clock.
* **Dynamic Track Rendering:** Automatically calculates track bounding boxes and translates raw geographical coordinates to scalable Canvas pixels.
* **Fully Containerized:** Deploys instantly via Docker with pre-configured bridge networks or host-port binding.

---

## 🚀 Quick Start (Docker)

You can run this entire stack on any machine without touching the source code. The images are hosted publicly on Docker Hub.

**1. Pull the Images**
```bash
docker pull sunilswain7/f1-backend:v1
docker pull sunilswain7/f1-frontend:v1