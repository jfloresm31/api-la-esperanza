require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors()); // Permite que el frontend se conecte sin bloqueos de seguridad
app.use(express.json()); // Permite recibir datos en JSON

// Configuración del pool de conexiones a MySQL (Aiven)
const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false } // Aiven requiere SSL por seguridad
};

// ==========================================
// ENDPOINTS DE LA API RESTful
// ==========================================

// 1. Iniciar Sesión (Login)
app.post('/api/login', async (req, res) => {
    try {
        const { correo } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        const [filas] = await conexion.execute('SELECT * FROM cliente WHERE correo = ?', [correo]);
        await conexion.end();

        if (filas.length > 0) {
            res.json({ exito: true, usuario: filas[0] });
        } else {
            res.status(401).json({ exito: false, error: 'Correo no registrado.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor.' });
    }
});

// 2. Registrar Usuario
app.post('/api/registro', async (req, res) => {
    try {
        const { nombre, correo, direccion, tech } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        await conexion.execute(
            'INSERT INTO cliente (correo, nombre, direccion, nivel_tecnologico) VALUES (?, ?, ?, ?)',
            [correo, nombre, direccion, tech || 'Smartphone']
        );
        await conexion.end();
        res.json({ exito: true, mensaje: 'Usuario registrado correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'El correo ya existe o hubo un error.' });
    }
});

// 3. Obtener Catálogo (Solo productos con stock)
app.get('/api/productos', async (req, res) => {
    try {
        const conexion = await mysql.createConnection(dbConfig);
        const [filas] = await conexion.execute('SELECT * FROM producto WHERE stock_disponible > 0');
        await conexion.end();
        res.json(filas);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener productos.' });
    }
});

// 4. Procesar Checkout (Compra)
app.post('/api/checkout', async (req, res) => {
    try {
        const { id_cliente, tipo_entrega, metodo_pago, total, carrito } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        
        // Iniciar transacción (Para que sea 100% seguro)
        await conexion.beginTransaction();

        // Descontar cada producto del carrito
        for (let item of carrito) {
            await conexion.execute(
                'UPDATE producto SET stock_disponible = stock_disponible - ? WHERE id_producto = ?',
                [item.cantidad, item.id_producto]
            );
        }

        // Generar Token de 6 caracteres
        const token = Math.random().toString(36).substring(2, 8).toUpperCase();

        // Guardar el pedido
        await conexion.execute(
            'INSERT INTO pedido (id_cliente, tipo_entrega, metodo_pago, total, token_digital) VALUES (?, ?, ?, ?, ?)',
            [id_cliente, tipo_entrega, metodo_pago, total, token]
        );

        await conexion.commit(); // Confirmar cambios
        await conexion.end();

        res.json({ exito: true, token: token });
    } catch (error) {
        res.status(500).json({ error: 'Error al procesar el pedido. Verifica el stock.' });
    }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API RESTful "La Esperanza" corriendo en el puerto ${PORT}`);
});