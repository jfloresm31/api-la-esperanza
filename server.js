require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de conexión a Aiven
const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
};

// ==========================================
// 1. ENDPOINT: LOGIN DE USUARIOS
// ==========================================
app.post('/api/login', async (req, res) => {
    try {
        const { correo, password } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        
        // Buscar al cliente en la base de datos
        const [filas] = await conexion.execute(
            'SELECT id_cliente, nombre, correo, nivel_tecnologico FROM cliente WHERE correo = ? AND password = ?',
            [correo, password]
        );
        await conexion.end();

        if (filas.length > 0) {
            res.json({ exito: true, usuario: filas[0] });
        } else {
            res.status(401).json({ exito: false, error: 'Correo o contraseña incorrectos.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error al conectar con el servidor.' });
    }
});

// ==========================================
// 2. ENDPOINT: CATÁLOGO DE PRODUCTOS
// ==========================================
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

// ==========================================
// 3. ENDPOINT: COMPRAR PRODUCTOS
// ==========================================
app.post('/api/checkout', async (req, res) => {
    try {
        const { id_cliente, tipo_entrega, metodo_pago, total, carrito } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        
        await conexion.beginTransaction();

        // Descontar inventario
        for (let item of carrito) {
            await conexion.execute(
                'UPDATE producto SET stock_disponible = stock_disponible - ? WHERE id_producto = ? AND stock_disponible >= ?',
                [item.cantidad, item.id_producto, item.cantidad]
            );
        }

        // Generar token y guardar pedido
        const token = Math.random().toString(36).substring(2, 8).toUpperCase();
        await conexion.execute(
            'INSERT INTO pedido (id_cliente, tipo_entrega, metodo_pago, total, token_digital) VALUES (?, ?, ?, ?, ?)',
            [id_cliente, tipo_entrega, metodo_pago, total, token]
        );

        await conexion.commit();
        await conexion.end();
        res.json({ exito: true, token: token });
    } catch (error) {
        res.status(500).json({ error: 'Error al procesar el pedido. Verifica el stock.' });
    }
});

// ==========================================
// 4. ENDPOINT: VENDER COSECHA (NUEVO)
// ==========================================
app.post('/api/vender', async (req, res) => {
    try {
        const { id_cliente, producto_ofrecido, cantidad_ofrecida, kiosco_entrega } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        
        await conexion.execute(
            'INSERT INTO venta_cliente (id_cliente, producto_ofrecido, cantidad_ofrecida, kiosco_entrega) VALUES (?, ?, ?, ?)',
            [id_cliente, producto_ofrecido, cantidad_ofrecida, kiosco_entrega]
        );
        
        await conexion.end();
        res.json({ exito: true, mensaje: 'Venta registrada con éxito. Lleva tu cosecha al kiosco.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al registrar la venta.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API RESTful "La Esperanza" corriendo en el puerto ${PORT}`);
});