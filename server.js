const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { create: createAltcha, CappedMap, deriveHmacKeySecret, randomInt } = require('altcha-lib/frameworks/express');
const { deriveKey } = require('altcha-lib/algorithms/pbkdf2');

const app = express();
const PORT = process.env.PORT || 3000;

// ALTCHA (proof-of-work anti-spam). Sin ALTCHA_HMAC_SECRET se genera una clave
// aleatoria al iniciar: funciona con una sola instancia, pero los desafíos
// emitidos antes de un reinicio dejan de ser válidos.
const ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.ALTCHA_HMAC_SECRET) {
  console.warn('ALTCHA_HMAC_SECRET no definido; usando clave aleatoria temporal.');
}
const ALTCHA_EXPIRES_SECONDS = 10 * 60;
const altchaReady = deriveHmacKeySecret(ALTCHA_HMAC_SECRET).then((hmacKeySignatureSecret) => createAltcha({
  createChallengeParameters: () => ({
    algorithm: 'PBKDF2/SHA-256',
    cost: 5000,
    counter: randomInt(5000, 10000),
    expiresAt: Math.floor(Date.now() / 1000) + ALTCHA_EXPIRES_SECONDS,
  }),
  deriveKey,
  hmacSignatureSecret: ALTCHA_HMAC_SECRET,
  hmacKeySignatureSecret,
  // Evita reutilizar una misma solución (replay)
  store: new CappedMap({ maxSize: 10000 }),
}));

app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com"],
      connectSrc: ["'self'", "https://www.google-analytics.com", "https://analytics.google.com"],
      workerSrc: ["'self'"],
    },
  },
}));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
}));

// Archivos del widget ALTCHA servidos desde node_modules
const altchaDist = path.join(__dirname, 'node_modules', 'altcha', 'dist');
app.get('/vendor/altcha/altcha.min.js', (req, res) => res.sendFile(path.join(altchaDist, 'external', 'altcha.min.js')));
app.get('/vendor/altcha/altcha.css', (req, res) => res.sendFile(path.join(altchaDist, 'external', 'altcha.css')));
app.get('/vendor/altcha/es-419.js', (req, res) => res.sendFile(path.join(altchaDist, 'i18n', 'es-419.js')));
app.get('/vendor/altcha/workers/pbkdf2.js', (req, res) => res.sendFile(path.join(altchaDist, 'workers', 'pbkdf2.js')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Parse JSON bodies for API routes
app.use(express.json());

// ALTCHA challenge endpoint
app.get('/api/altcha/challenge', (req, res, next) => {
  altchaReady.then((altcha) => altcha.challengeHandler(req, res, next), next);
});

const verifyAltcha = (req, res, next) => {
  altchaReady.then((altcha) => altcha.middleware({ throwOnFailure: false })(req, res, next), next);
};

// Contact form endpoint
app.post('/api/contact', verifyAltcha, (req, res) => {
  if (res.locals.altcha.error) {
    console.warn('altcha:', res.locals.altcha.error);
    return res.status(403).json({ error: 'Verificación anti-spam fallida. Intente nuevamente.' });
  }

  const { nombre, email, municipalidad, mensaje } = req.body;

  if (!nombre || !email) {
    return res.status(400).json({ error: 'Nombre y email son requeridos.' });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email no válido.' });
  }

  const to = 'claudio@olisan.cl';
  const subject = 'Solicitud de información - TreeSoft';
  const body = [
    `Nombre: ${nombre}`,
    `Email: ${email}`,
    `Municipalidad: ${municipalidad || 'No especificada'}`,
    '',
    `Mensaje:`,
    mensaje || 'Solicito información sobre TreeSoft.',
  ].join('\n');

  const mailContent = [
    `To: ${to}`,
    `From: "TreeSoft Web" <noreply@treesoft.cl>`,
    `Reply-To: ${email}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=UTF-8`,
    '',
    body,
  ].join('\n');

  const sendmail = execFile('/usr/sbin/sendmail', ['-t', '-f', 'noreply@treesoft.cl'], (err) => {
    if (err) {
      console.error('sendmail error:', err.message);
      return res.status(500).json({ error: 'Error al enviar el mensaje.' });
    }
    res.json({ ok: true });
  });

  sendmail.stdin.write(mailContent);
  sendmail.stdin.end();
});

// Health check for monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`TreeSoft web server running on port ${PORT}`);
});
