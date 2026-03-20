# Despliegue TreeSoft Web — Ubuntu + Apache + Node.js

## 1. Preparar el servidor

```bash
# Instalar Node.js (v20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 para gestión de procesos
sudo npm install -g pm2

# Habilitar módulos de Apache necesarios
sudo a2enmod proxy proxy_http rewrite ssl headers deflate
sudo systemctl restart apache2
```

## 2. Subir el proyecto

```bash
# Crear directorio
sudo mkdir -p /var/www/treesoft
sudo chown $USER:$USER /var/www/treesoft

# Copiar archivos (desde tu máquina local)
scp -r web/* usuario@servidor:/var/www/treesoft/

# Instalar dependencias en el servidor
cd /var/www/treesoft
npm install --production
```

## 3. Configurar PM2

```bash
cd /var/www/treesoft
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # seguir las instrucciones que muestre
```

## 4. Configurar Apache

```bash
# Copiar configuración
sudo cp /var/www/treesoft/treesoft.conf /etc/apache2/sites-available/treesoft.conf

# Habilitar sitio
sudo a2ensite treesoft.conf
sudo a2dissite 000-default.conf  # opcional: deshabilitar sitio default

# Verificar configuración
sudo apache2ctl configtest

# Recargar Apache
sudo systemctl reload apache2
```

## 5. SSL con Let's Encrypt

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d treesoft.cl -d www.treesoft.cl
```

## 6. Verificar

```bash
# Verificar que Node.js está corriendo
pm2 status

# Verificar health check
curl http://localhost:3000/health

# Verificar desde afuera
curl -I https://treesoft.cl
```

## Comandos útiles

```bash
# Ver logs de la aplicación
pm2 logs treesoft-web

# Reiniciar la aplicación
pm2 restart treesoft-web

# Ver logs de Apache
sudo tail -f /var/log/apache2/treesoft-error.log
sudo tail -f /var/log/apache2/treesoft-access.log

# Actualizar el sitio (después de subir nuevos archivos)
cd /var/www/treesoft && npm install --production && pm2 restart treesoft-web
```
