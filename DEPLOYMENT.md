# Deployment Guide

## Quick Start

### Primera instalación en servidor nuevo

1. **Conectar al servidor via SSH:**
   ```bash
   ssh user@your-server
   ```

2. **Descargar y ejecutar el script de inicialización:**
   ```bash
   curl -fsSL https://raw.githubusercontent.com/tu-org/reach-backend/main/scripts/server-init.sh | bash
   ```

   O manualmente:
   ```bash
   mkdir -p /home/opc/apps/reach-backend
   cd /home/opc/apps/reach-backend
   # Copiar server-init.sh y ejecutar
   chmod +x server-init.sh
   ./server-init.sh
   ```

3. **Configurar variables de entorno:**
   ```bash
   nano /home/opc/apps/reach-backend/.env
   ```

4. **Login al registry y arrancar:**
   ```bash
   docker login registry.reachsdk.online
   ./start.sh
   ```

---

## GitHub Actions Secrets Requeridos

Configurar en: `Settings > Secrets and variables > Actions`

### Registry & Deployment
| Secret | Descripción |
|--------|-------------|
| `REGISTRY_USERNAME` | Usuario del container registry |
| `REGISTRY_PASSWORD` | Password del container registry |
| `OCI_HOST` | IP o hostname del servidor |
| `OCI_SSH_USER` | Usuario SSH (ej: `opc`) |
| `OCI_SSH_KEY` | Clave privada SSH completa |

### Application Secrets
| Secret | Descripción |
|--------|-------------|
| `DB_URI` | MongoDB connection string |
| `CRYPTO_SECRET` | Secret para encriptación |
| `CDN_SECRET_KEY` | Secret para protección CDN |
| `UPDATE_SECRET` | Secret para API de updates |
| `DASHBOARD_URL` | URL del dashboard |
| `POLAR_API_KEY` | API key de Polar.sh |
| `POLAR_WEBHOOK_SECRET` | Webhook secret de Polar |
| `POLAR_ENDPOINT_URI` | URI del endpoint de Polar |
| `RESEND_API_KEY` | API key de Resend |

---

## Estructura en el Servidor

```
/home/opc/apps/reach-backend/
├── docker-compose.yml    # Configuración del contenedor
├── .env                  # Variables de entorno (secretos)
├── start.sh              # Iniciar contenedor
├── stop.sh               # Detener contenedor
├── logs.sh               # Ver logs
├── update.sh             # Actualizar imagen
├── backup-cdn.sh         # Backup del volumen CDN
└── backups/              # Directorio de backups
```

---

## Volúmenes Docker

| Volumen | Punto de montaje | Descripción |
|---------|------------------|-------------|
| `reach-cdn-data` | `/app/cdn` | Archivos subidos, updates, instancias |

### Estructura del volumen CDN:
```
/app/cdn/
├── temp/                           # Archivos temporales
├── updates/                        # Actualizaciones de Tauri
│   ├── latest.json                 # Manifest actual
│   ├── archive/                    # Historial de versiones
│   └── *.zip, *.tar.gz             # Bundles de actualización
└── instances/
    ├── assets/                     # Assets de instancias
    ├── packages/                   # Paquetes de modpacks
    ├── experience-archives/        # Archivos de experiencias
    └── experience-folders/         # Carpetas de experiencias
```

---

## Comandos Útiles

### Ver estado del contenedor:
```bash
docker compose ps
docker compose logs -f
```

### Acceder al contenedor:
```bash
docker compose exec reach-backend sh
```

### Ver uso de disco del volumen:
```bash
docker system df -v | grep reach-cdn-data
```

### Backup manual del CDN:
```bash
./backup-cdn.sh
```

### Restaurar backup:
```bash
docker run --rm \
    -v reach-cdn-data:/target \
    -v $(pwd)/backups:/backup \
    alpine tar xzf /backup/cdn_backup_TIMESTAMP.tar.gz -C /target
```

---

## Troubleshooting

### El contenedor no arranca
```bash
docker compose logs reach-backend
docker inspect reach-backend --format='{{.State.Health.Status}}'
```

### Problemas de permisos en CDN
```bash
docker compose exec reach-backend ls -la /app/cdn
```

### Verificar conectividad a MongoDB
```bash
docker compose exec reach-backend sh -c 'wget -qO- http://localhost:3000/health'
```

### Limpiar todo y empezar de nuevo
```bash
docker compose down -v  # ⚠️ ESTO ELIMINA LOS DATOS
docker volume rm reach-cdn-data
./server-init.sh
```

---

## Traefik Integration

El contenedor está configurado para funcionar con Traefik como reverse proxy:

- **Dominio**: `devs.reachsdk.online`
- **HTTP**: Redirige automáticamente a HTTPS
- **HTTPS**: TLS con certificado de Cloudflare
- **Puerto interno**: 3000

Asegúrate de que Traefik esté corriendo y conectado a la red `frontend`:
```bash
docker network inspect frontend
```
