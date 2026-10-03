# PDF Signer — MVP

Prototipo mínimo viable del sistema de firma y llenado de PDFs.

## Stack

- **Backend**: Node.js + Express + SQLite (`better-sqlite3`) + `pdf-lib`  
- **Frontend**: HTML + CSS + JS vanilla (sin framework, sin build)  
- **Sin MongoDB**, sin monorepo, sin Prisma — funciona con `node src/index.js`

## Estructura

```
mvp/
├── backend/
│   ├── src/
│   │   ├── index.js       # Servidor Express con todos los endpoints
│   │   ├── db.js          # SQLite setup y esquema
│   │   └── pdf-engine.js  # Análisis y llenado de PDFs (pdf-lib)
│   ├── data/              # mvp.db (auto-creado)
│   ├── storage/           # Archivos PDF guardados (auto-creado)
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── start.sh               # Script de inicio todo-en-uno
```

## Inicio rápido

### 1. Instalar dependencias del backend

```bash
cd mvp/backend
npm install
```

### 2. Iniciar backend (puerto 3001)

```bash
node src/index.js
```

### 3. Abrir el frontend

Abre `mvp/frontend/index.html` directamente en el navegador,  
**o** sirve la carpeta con:

```bash
npx serve mvp/frontend
```

> ⚠️ Si abres el HTML directo con `file://` y el navegador bloquea las peticiones CORS, usa `npx serve`.

## Flujo de uso

1. **Subir plantilla** → clic en "Subir plantilla", selecciona un PDF con campos de formulario
2. **Ver campos** → el sistema analiza el PDF y muestra los campos detectados
3. **Crear transacción** → clic en "Crear transacción" desde la plantilla
4. **Llenar campos** → rellena el formulario y guarda
5. **Generar PDF** → clic en "Generar PDF final" para producir el PDF con los datos incrustados
6. **Descargar** → descarga o previsualiza el PDF generado

## API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/templates` | Subir PDF y analizar campos |
| `GET` | `/api/templates` | Listar plantillas |
| `GET` | `/api/templates/:id` | Detalle de plantilla |
| `GET` | `/api/templates/:id/pdf` | Descargar PDF original |
| `DELETE` | `/api/templates/:id` | Eliminar plantilla |
| `POST` | `/api/transactions/:templateId` | Crear transacción |
| `GET` | `/api/transactions` | Listar transacciones |
| `GET` | `/api/transactions/:id` | Detalle de transacción |
| `PATCH` | `/api/transactions/:id` | Actualizar datos del formulario |
| `POST` | `/api/transactions/:id/flatten` | Generar PDF con datos |
| `GET` | `/api/transactions/:id/pdf` | Descargar PDF actual |
| `POST` | `/api/transactions/:id/cancel` | Cancelar transacción |
| `GET` | `/api/health` | Health check |

## Convención de nombres de campos en el PDF

Los campos del PDF deben seguir la nomenclatura del sistema:

```
nombre               → texto libre, no obligatorio
nombre:req           → texto libre, obligatorio  
email:cliente:req    → email, obligatorio
date:nacimiento      → fecha
num:cedula:req       → número, obligatorio
phone:celular        → teléfono
```

Ver el [README principal](../README.md) para la referencia completa.
