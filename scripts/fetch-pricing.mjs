#!/usr/bin/env node
/**
 * Builds data/pricing.json from the public AWS Price List Bulk API (us-east-1, on-demand, first
 * tier). No credentials needed. Run:  node scripts/fetch-pricing.mjs > data/pricing.json
 * Every rate in the simulator's cost model comes from this file, which records the price-list
 * publication date per service so the reader can see how current it is.
 */
const BASE = 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws';
const REGION = 'US East (N. Virginia)';

async function offer(code) {
  const res = await fetch(`${BASE}/${code}/current/us-east-1/index.json`);
  if (!res.ok) throw new Error(`${code}: ${res.status}`);
  return res.json();
}
/** First on-demand tier (beginRange 0) for products matching `pick`, keyed by usagetype. */
function firstTier(doc, pick) {
  const out = {};
  for (const [sku, p] of Object.entries(doc.products)) {
    const a = p.attributes;
    if (a.location !== REGION && !(a.usagetype ?? '').startsWith('USE1')) continue;
    if (!pick(a)) continue;
    for (const term of Object.values(doc.terms.OnDemand[sku] ?? {})) {
      for (const dim of Object.values(term.priceDimensions)) {
        if (dim.beginRange === '0') out[a.usagetype] = { usd: Number(dim.pricePerUnit.USD), unit: dim.unit, description: dim.description };
      }
    }
  }
  return out;
}

const [lambda, states, sqs, sns, apigw, ddb] = await Promise.all(['AWSLambda', 'AmazonStates', 'AWSQueueService', 'AmazonSNS', 'AmazonApiGateway', 'AmazonDynamoDB'].map(offer));
const L = firstTier(lambda, (a) => ['AWS-Lambda-Duration', 'AWS-Lambda-Requests'].includes(a.group) && a.location === REGION);
const S = firstTier(states, (a) => (a.usagetype ?? '').startsWith('USE1-'));
const Q = firstTier(sqs, (a) => a.location === REGION && a.usagetype === 'Requests-RBP');
const G = firstTier(apigw, (a) => a.location === REGION && ['USE1-ApiGatewayRequest', 'USE1-ApiGatewayHttpRequest'].includes(a.usagetype));
const D = firstTier(ddb, (a) => a.location === REGION && ['ReadRequestUnits', 'WriteRequestUnits'].includes(a.usagetype));

const snsPaid = Object.values(sns.terms.OnDemand).flatMap((t) => Object.values(t)).flatMap((t) => Object.values(t.priceDimensions)).find((d) => d.description.includes('$0.50 per 1,000,000 Amazon SNS API Requests'));

const pricing = {
  source: 'AWS Price List Bulk API, us-east-1, on-demand, first pricing tier',
  fetched: new Date().toISOString().slice(0, 10),
  published: { lambda: lambda.publicationDate, stepFunctions: states.publicationDate, sqs: sqs.publicationDate, sns: sns.publicationDate, apiGateway: apigw.publicationDate, dynamodb: ddb.publicationDate },
  rates: {
    lambdaRequest: { usd: L['Lambda-GB-Second'] ? L.Request.usd : NaN, per: 'request', note: L.Request.description },
    lambdaGbSecond: { usd: L['Lambda-GB-Second'].usd, per: 'GB-second (x86, first tier)', note: L['Lambda-GB-Second'].description },
    stateTransition: { usd: S['USE1-StateTransition'].usd, per: 'state transition (Standard workflows)', note: S['USE1-StateTransition'].description },
    expressRequest: { usd: S['USE1-StepFunctions-Request'].usd, per: 'request (Express workflows)', note: S['USE1-StepFunctions-Request'].description },
    expressGbSecond: { usd: S['USE1-StepFunctions-GB-Second'].usd, per: 'GB-second (Express, first tier)', note: S['USE1-StepFunctions-GB-Second'].description },
    sqsRequest: { usd: Q['Requests-RBP'].usd, per: 'standard queue request (first tier)', note: Q['Requests-RBP'].description },
    snsRequest: { usd: snsPaid ? Number(snsPaid.pricePerUnit.USD) : NaN, per: 'API request beyond the free 1M/month', note: snsPaid?.description ?? '' },
    apiGatewayRestRequest: { usd: G['USE1-ApiGatewayRequest'].usd, per: 'REST API request (first tier)', note: G['USE1-ApiGatewayRequest'].description },
    apiGatewayHttpRequest: { usd: G['USE1-ApiGatewayHttpRequest']?.usd ?? NaN, per: 'HTTP API request (first tier)', note: G['USE1-ApiGatewayHttpRequest']?.description ?? 'not present in the offer file' },
    dynamoWriteUnit: { usd: D.WriteRequestUnits.usd, per: 'on-demand write request unit', note: D.WriteRequestUnits.description },
    dynamoReadUnit: { usd: D.ReadRequestUnits.usd, per: 'on-demand read request unit', note: D.ReadRequestUnits.description }
  }
};
process.stdout.write(`${JSON.stringify(pricing, null, 2)}\n`);
