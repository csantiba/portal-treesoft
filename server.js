const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

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
    },
  },
}));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Parse JSON bodies for API routes
app.use(express.json());

// Contact form endpoint
app.post('/api/contact', (req, res) => {
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
