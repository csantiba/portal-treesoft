# Despliegue TreeSoft Web — Ubuntu + Apache + Node.js + systemd

Producción (treesoft.cl) corre en `/var/www/treesoft` como servicio systemd `treesoft-web`,
escuchando en el puerto **3001**. Apache termina SSL y hace proxy a `127.0.0.1:3001`.

> El servicio se migró desde PM2 el 2026-08-21. `ecosystem.config.js` ya no se usa en producción.

## Actualizar el sitio

Desde el servidor, con el repo clonado en `/root/proyectos/sitio-treesoft`:

```bash
cd /root/proyectos/sitio-treesoft && git pull

# Respaldo
cp -a /var/www/treesoft /var/www/treesoft.bak-$(date +%Y%m%d-%H%M%S)

# Copiar código (sin tocar node_modules ni archivos propios de producción)
rsync -a --exclude=.git --exclude=node_modules --exclude=package-lock.json \
  --exclude=ecosystem.config.js --exclude=.gitignore \
  /root/proyectos/sitio-treesoft/ /var/www/treesoft/

# Dependencias y reinicio
cd /var/www/treesoft && npm install --omit=dev --legacy-peer-deps
systemctl restart treesoft-web
```

> `--legacy-peer-deps` evita un error de npm 10.x (`Cannot read properties of null (reading 'edgesOut')`)
> al resolver las peer dependencies opcionales de `altcha`.

Volver atrás:

```bash
rm -rf /var/www/treesoft && mv /var/www/treesoft.bak-<fecha> /var/www/treesoft
systemctl restart treesoft-web
```

## Verificar

```bash
systemctl status treesoft-web
curl http://127.0.0.1:3001/health
curl -I https://treesoft.cl
curl -s https://treesoft.cl/api/altcha/challenge   # debe devolver un desafío JSON
```

## Comandos útiles

```bash
# Logs de la aplicación
journalctl -u treesoft-web -f

# Reiniciar
systemctl restart treesoft-web

# Logs de Apache
tail -f /var/log/apache2/treesoft-error.log
tail -f /var/log/apache2/treesoft-access.log
```

## Instalación desde cero

### 1. Node.js y Apache

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo a2enmod proxy proxy_http rewrite ssl headers deflate
sudo systemctl restart apache2
```

El formulario de contacto envía correo con `/usr/sbin/sendmail`, que debe estar instalado.

### 2. Código

Copiar el proyecto a `/var/www/treesoft` (ver "Actualizar el sitio").

### 3. Servicio systemd

`/etc/systemd/system/treesoft-web.service`:

```ini
[Unit]
Description=treesoft-web (treesoft.cl)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/treesoft
ExecStart=/usr/bin/node /var/www/treesoft/server.js
Environment=NODE_ENV=production
Environment=PORT=3001
MemoryHigh=256M
MemoryMax=384M
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=treesoft-web

[Install]
WantedBy=multi-user.target
```

### 4. Clave ALTCHA

El formulario usa [ALTCHA](https://altcha.org) como anti-spam. Los desafíos se firman con
`ALTCHA_HMAC_SECRET`; si no se define, se genera una clave aleatoria en cada arranque
(un formulario abierto durante un reinicio fallará la verificación y deberá reintentarse).
La clave vive fuera del unit, en un archivo legible solo por root:

```bash
install -d -m 700 /etc/treesoft-web
(umask 077; echo "ALTCHA_HMAC_SECRET=$(openssl rand -hex 32)" > /etc/treesoft-web/env)

mkdir -p /etc/systemd/system/treesoft-web.service.d
cat > /etc/systemd/system/treesoft-web.service.d/altcha.conf <<'EOF'
[Service]
EnvironmentFile=/etc/treesoft-web/env
EOF

systemctl daemon-reload
systemctl enable --now treesoft-web
```

### 5. Apache y SSL

```bash
sudo cp /var/www/treesoft/treesoft.conf /etc/apache2/sites-available/treesoft.conf
sudo a2ensite treesoft.conf
sudo apache2ctl configtest && sudo systemctl reload apache2

sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d treesoft.cl -d www.treesoft.cl
```
