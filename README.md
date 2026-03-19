# Serverless Workflow Simulator

An interactive simulator for event-driven serverless architectures. Visualize Lambda execution flows, cold starts, concurrency limits, and cost projections in real time. Single-page web application deployable on GitHub Pages.

## Features

### Workflow Visualization
- Animated data flow through serverless pipeline stages
- Real-time node status: active, complete, error
- Per-stage execution timing with cold start indicators
- Arrow-based flow animation between services

### Pre-Built Workflow Templates
- **REST API** — API Gateway → Lambda → DynamoDB
- **Image Processing** — S3 → Lambda → Rekognition → S3
- **Data Streaming** — Kinesis → Lambda → Firehose → S3
- **Scheduled Batch** — EventBridge → Lambda → SQS → Lambda → SNS
- **Webhook Processor** — API Gateway → SQS → Lambda → SNS

### Execution Simulation
- Configurable concurrency limits (1-50 concurrent executions)
- Adjustable error rate injection (0-30%)
- Cold start simulation with ~15% frequency
- Memory allocation effects on execution duration
- Timeout configuration

### Performance Metrics
- **Invocation Tracking** — Total, successful, and failed invocations
- **Duration Distribution** — Histogram of execution times
- **Cold Start Analysis** — Cold vs warm start frequency and average durations
- **Cost Projection** — Per-invocation cost based on memory and duration
- **Concurrency Visualization** — Live slot utilization bar

### Error Handling
- Simulated Lambda errors (timeout, OOM, throttling, connection refused)
- Dead Letter Queue visualization for failed messages
- Error rate tracking and reporting

### Execution Log
- Real-time event feed with timestamps
- Color-coded success/error entries
- Run-by-run execution history

## Technologies

- **JavaScript** — Workflow engine, simulation logic, and async execution
- **Chart.js** — Duration distribution and cost projection charts
- **HTML5/CSS3** — Animated pipeline visualization
- **Client-Side Only** — No backend or AWS account required

## How to Use

1. Open `index.html` in any modern browser
2. Select a **workflow template** (REST API, Image Processing, etc.)
3. Configure simulation parameters: speed, concurrency, error rate, memory, timeout
4. Click **Run Workflow** to start the simulation
5. Watch the animated pipeline and monitor metrics in real time
6. Review execution logs, cold start analysis, and cost projections

## Use Cases

- **Serverless Architecture Design** — Understand event-driven patterns and trade-offs
- **AWS Lambda Training** — Learn cold starts, concurrency, and cost optimization
- **DevOps Education** — Demonstrate serverless monitoring and error handling
- **Technical Interviews** — Discuss serverless architecture with visual aids

## License

MIT License
