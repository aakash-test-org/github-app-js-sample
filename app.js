import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import { App } from '@octokit/app';
import { createNodeMiddleware } from '@octokit/webhooks';

// Load environment variables from .env file
dotenv.config();

// Set configured values
const appId = process.env.APP_ID;
const privateKeyPath = process.env.PRIVATE_KEY_PATH;
const webhookSecret = process.env.WEBHOOK_SECRET;
const port = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// Read the private key from the file
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

const githubApp = new App({
  appId: appId,
  privateKey: privateKey,
  webhooks: {
    secret: webhookSecret
  },
});

// Middleware to log all incoming requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Handle app installation
githubApp.webhooks.on('installation.created', async ({ octokit, payload }) => {
  console.log('App installed! Installation ID:', payload.installation.id);
  
  // Generate an installation access token
  const { data: { token } } = await octokit.apps.createInstallationAccessToken({
    installation_id: payload.installation.id,
  });
  
  console.log('Installation Access Token:', token);
});

// Handle workflow run events
githubApp.webhooks.on('workflow_run', async ({ octokit, payload }) => {
  console.log('Workflow run detected!');
  console.log('Action:', payload.action);
  console.log('Workflow name:', payload.workflow_run.name);
  console.log('Repository:', payload.repository.full_name);
});

// Create a webhook endpoint
const middleware = createNodeMiddleware(githubApp.webhooks);

app.post('/github/webhooks', (req, res) => {
  console.log('Received webhook request');
  middleware(req, res, (err) => {
    if (err) {
      console.error('Error in webhook middleware:', err);
      res.status(500).send('Webhook Error');
    } else {
      res.status(200).send('Webhook received');
    }
  });
});

// Add a test route
app.get('/test', (req, res) => {
  res.status(200).send('Server is running');
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Webhook URL: http://203.217.148.156/github/webhooks`);
  console.log(`Test URL: http://203.217.148.156/test`);
});