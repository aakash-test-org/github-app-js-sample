import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import { App } from '@octokit/app';
import { createNodeMiddleware } from '@octokit/webhooks';

dotenv.config();

const appId = process.env.APP_ID;
const privateKeyPath = process.env.PRIVATE_KEY_PATH;
const webhookSecret = process.env.WEBHOOK_SECRET;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const port = process.env.PORT || 3000;
const ipAddress = '203.217.148.156';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/*' }));
app.use(express.raw({ type: 'application/octet-stream' }));

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

const githubApp = new App({
  appId: appId,
  privateKey: privateKey,
  webhooks: {
    secret: webhookSecret
  },
});

// Function to safely stringify objects, handling circular references
const safeStringify = (obj, indent = 2) => {
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return '[Circular]';
      }
      cache.add(value);
    }
    return value;
  }, indent);
};

// Webhook handler for all events
githubApp.webhooks.onAny(async ({ id, name, payload }) => {
  console.log('Webhook received:');
  console.log('Event ID:', id);
  console.log('Event Name:', name);
  console.log('Payload:', safeStringify(payload));
});

// Handler for app installation
githubApp.webhooks.on('installation.created', async ({ id, payload, octokit }) => {
  console.log('App installed on a new repository!');
  console.log('Installation ID:', payload.installation.id);
});

// Specific handler for workflow_run events
githubApp.webhooks.on('workflow_run', async ({ id, name, payload }) => {
  console.log('Workflow run event detected!');
  console.log('Workflow:', payload.workflow.name);
  console.log('Action:', payload.action);
  console.log('Status:', payload.workflow_run.status);
  console.log('Conclusion:', payload.workflow_run.conclusion);
  console.log('Repository:', payload.repository.full_name);
  console.log('Triggered by:', payload.workflow_run.triggering_actor.login);
});

// Create a webhook endpoint
const middleware = createNodeMiddleware(githubApp.webhooks);
app.post('/github/webhooks', (req, res) => {
  console.log('Received webhook request');
  console.log('Headers:', safeStringify(req.headers));
  console.log('Body:', safeStringify(req.body));
  middleware(req, res, (err) => {
    if (err) {
      console.error('Error in webhook middleware:', err);
      res.status(500).send('Webhook Error');
    } else {
      res.status(200).send('Webhook processed successfully');
    }
  });
});

// OAuth routes
app.get('/login/github', (req, res) => {
  const redirectUri = `http://${ipAddress}:${port}/oauth/callback`;
  const authorizationUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}`;
  res.redirect(authorizationUrl);
});

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('Error exchanging code for access token:', data.error);
      return res.status(500).send('Error exchanging code for access token');
    }

    console.log('Access Token:', data.access_token);
    console.log('Token Type:', data.token_type);
    console.log('Scope:', data.scope);

    res.send(`Access token generated successfully: ${data.access_token}`);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.status(500).send('Error in OAuth process');
  }
});

// Catch-all route
app.use((req, res) => {
  console.log('Received request on undefined endpoint:');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', safeStringify(req.headers));
  console.log('Body:', safeStringify(req.body));

  res.status(404).send('Endpoint not found, but request logged');
});

// Start the server
app.listen(port, ipAddress, () => {
  console.log(`Server is running on http://${ipAddress}:${port}`);
  console.log(`Webhook URL: http://${ipAddress}:${port}/github/webhooks`);
  console.log(`OAuth login URL: http://${ipAddress}:${port}/login/github`);
});