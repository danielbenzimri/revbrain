/**
 * Cloud Run Trigger Proxy — tiny HTTP service that triggers Cloud Run Jobs.
 *
 * Uses Cloud Run's built-in identity (metadata server) to authenticate
 * with the Cloud Run Jobs API — no stored credentials needed.
 */

import { createServer } from 'node:http';

const PORT = Number(process.env.PORT) || 8080;
const TRIGGER_SECRET = process.env.TRIGGER_SECRET;
const GCP_PROJECT = process.env.GCP_PROJECT;
const GCP_REGION = process.env.GCP_REGION || 'us-central1';
const JOB_NAME = process.env.JOB_NAME || 'cpq-worker-stg';

if (!TRIGGER_SECRET) throw new Error('TRIGGER_SECRET is required');
if (!GCP_PROJECT) throw new Error('GCP_PROJECT is required');

async function getAccessToken(): Promise<string> {
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } }
  );
  if (!res.ok) throw new Error(`Metadata server error: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"status":"ok"}');
    return;
  }

  if (req.url === '/trigger' && req.method === 'POST') {
    if (req.headers.authorization !== `Bearer ${TRIGGER_SECRET}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":"unauthorized"}');
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString());

    if (!body.runId || !body.connectionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end('{"error":"runId and connectionId required"}');
      return;
    }

    try {
      const token = await getAccessToken();
      const url = `https://${GCP_REGION}-run.googleapis.com/v2/projects/${GCP_PROJECT}/locations/${GCP_REGION}/jobs/${JOB_NAME}:run`;

      const apiRes = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          overrides: {
            containerOverrides: [{
              env: [
                { name: 'JOB_ID', value: body.jobId ?? `job-${Date.now()}` },
                { name: 'RUN_ID', value: body.runId },
                { name: 'CONNECTION_ID', value: body.connectionId },
              ],
            }],
          },
        }),
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.text();
        throw new Error(`Cloud Run Jobs API ${apiRes.status}: ${errBody}`);
      }

      const data = await apiRes.json();
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, execution: data }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Trigger failed:', msg);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => console.log(`Trigger proxy listening on :${PORT}`));
