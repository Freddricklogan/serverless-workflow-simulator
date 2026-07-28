<h1 align="center">Serverless Workflow Simulator</h1>

<p align="center">
  <em>Model event-driven serverless pipelines — visualize Lambda execution flows, cold starts, and cost projections.</em>
</p>

<p align="center">
  <a href="https://freddricklogan.github.io/serverless-workflow-simulator/"><img src="https://img.shields.io/badge/Live_Demo-Open_App-ff9900?style=for-the-badge&logo=awslambda&logoColor=white" alt="Live Demo"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AWS-Lambda-ff9900?logo=awslambda&logoColor=white" alt="Lambda">
  <img src="https://img.shields.io/badge/JavaScript-Vanilla_ES6-f7df1e?logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Charts-Chart.js-ff6384?logo=chartdotjs&logoColor=white" alt="Chart.js">
  <img src="https://img.shields.io/badge/License-MIT-lightgrey" alt="License">
</p>

---

## Overview

**Serverless Workflow Simulator** models event-driven serverless architectures so you can reason
about their behavior *before* deploying them. Compose a pipeline of functions and event sources, run
the simulation, and see execution flows, **cold-start** impact, and **cost projections** — the three
things that most often surprise teams moving to serverless.

It demonstrates a working mental model of how Lambda-style compute actually behaves under load, and
the ability to turn that model into an interactive teaching and planning tool.

> **▶ [Launch the live demo](https://freddricklogan.github.io/serverless-workflow-simulator/)**

---

## Why this project

| Skill demonstrated | Where it shows up |
|:--|:--|
| **Serverless / event-driven architecture** | Function-and-event pipeline modeling |
| **Performance reasoning** | Cold-start analysis and its effect on latency |
| **Cloud cost modeling** | Per-invocation cost projections across a workflow |
| **Data visualization** | Execution-flow and metric charts with Chart.js |
| **Product design** | Packaging cloud expertise into an interactive simulator |

---

## Features

- **Event-driven pipeline modeling** of Lambda-style execution flows
- **Cold-start analysis** to quantify latency impact
- **Cost projections** across the workflow
- Real-time, chart-driven visualizations
- Fully client-side — nothing to install

---

## Tech stack

- **Language:** Vanilla JavaScript (ES6+)
- **Charting:** Chart.js
- **Runtime:** 100% client-side — no backend, no install

---

## Run locally

```bash
git clone https://github.com/Freddricklogan/serverless-workflow-simulator.git
cd serverless-workflow-simulator
python3 -m http.server 8000
# then visit http://localhost:8000
```

---

## Author

**Freddrick Logan** — Educational Technologist & Technology Leader
[GitHub](https://github.com/Freddricklogan) · [LinkedIn](https://www.linkedin.com/in/freddricklogan/)

## License

Released under the [MIT License](LICENSE).
