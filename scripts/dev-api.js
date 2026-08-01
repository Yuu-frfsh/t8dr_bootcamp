/**
 * Runs api/speak.js inside `vite dev`.
 *
 * On Vercel that file is a serverless function; locally there is no such
 * runtime, so /api/speak would 404 and the free text bar would silently fall
 * back to the device voice - meaning the Azure path could never be tested until
 * it was already deployed.
 *
 * This mounts the real handler (not a copy) behind a small shim for the two
 * Vercel-isms it uses: res.status() and res.json()/res.send().
 *
 * Dev only. The credential lives in this Node process and is never given to
 * Vite's `define`, so it cannot reach the client bundle.
 */
export function devApi(env = {}) {
  return {
    name: 't8dr-dev-api',
    apply: 'serve',

    configureServer(server) {
      for (const name of ['AZURE_KEY', 'AZURE_REGION']) {
        if (env[name] && process.env[name] === undefined) process.env[name] = env[name];
      }

      const configured = Boolean(process.env.AZURE_KEY && process.env.AZURE_REGION);
      server.config.logger.info(
        configured
          ? '  \x1b[32m➜\x1b[0m  /api/speak: Azure TTS configured'
          : '  \x1b[33m➜\x1b[0m  /api/speak: no AZURE_KEY - free text will use the device voice'
      );

      server.middlewares.use('/api/speak', async (req, res) => {
        // Vercel's res helpers, minimally.
        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
        res.json = (obj) => {
          if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(obj));
          return res;
        };
        res.send = (payload) => {
          res.end(payload);
          return res;
        };

        try {
          // Vite does not parse bodies; the handler already accepts a string.
          req.body = await new Promise((resolve, reject) => {
            let raw = '';
            req.setEncoding('utf8');
            req.on('data', (c) => {
              raw += c;
              // Refuse to buffer more than the endpoint would ever accept.
              if (raw.length > 64 * 1024) reject(new Error('body too large'));
            });
            req.on('end', () => resolve(raw));
            req.on('error', reject);
          });

          // ssrLoadModule so edits to api/speak.js take effect without a restart.
          const mod = await server.ssrLoadModule('/api/speak.js');
          await mod.default(req, res);
        } catch (err) {
          server.config.logger.error(`[dev-api] ${err && err.message ? err.message : err}`);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'dev api failed' }));
          }
        }
      });
    },
  };
}
