require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
};

// ==========================================
// 1. LOGIN
// ==========================================
app.post('/api/login', async (req, res) => {
    try {
        const { correo, password } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        const [filas] = await conexion.execute('SELECT * FROM cliente WHERE correo = ? AND password = ?', [correo, password]);
        await conexion.end();
        
        if (filas.length > 0) res.json({ exito: true, usuario: filas[0] });
        else res.status(401).json({ exito: false, error: 'Credenciales incorrectas.' });
    } catch (error) { 
        res.status(500).json({ error: 'Error del servidor al iniciar sesión.' }); 
    }
});

// ==========================================
// 2. CATÁLOGO DE PRODUCTOS
// ==========================================
app.get('/api/productos', async (req, res) => {
    try {
        const conexion = await mysql.createConnection(dbConfig);
        const [filas] = await conexion.execute('SELECT * FROM producto WHERE stock_disponible > 0');
        await conexion.end();
        res.json(filas);
    } catch (error) { 
        res.status(500).json({ error: 'Error al cargar el catálogo.' }); 
    }
});

// ==========================================
// 3. PROCESAR COMPRA
// ==========================================
app.post('/api/checkout', async (req, res) => {
    try {
        const { id_cliente, tipo_entrega, metodo_pago, carrito, ubicacion_especifica } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        await conexion.beginTransaction();

        const token = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const [resultPedido] = await conexion.execute(
            'INSERT INTO pedido (id_cliente, tipo_entrega, metodo_pago, total, token_digital, estado, ubicacion) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id_cliente, tipo_entrega, metodo_pago, 0, token, 'Preparando', ubicacion_especifica || 'Bodega Central']
        );
        const idPedido = resultPedido.insertId;

        for (let item of carrito) {
            await conexion.execute('UPDATE producto SET stock_disponible = stock_disponible - ? WHERE id_producto = ?', [item.cantidad, item.id_producto]);
            await conexion.execute('INSERT INTO pedido_detalle (id_pedido, id_producto, cantidad) VALUES (?, ?, ?)', [idPedido, item.id_producto, item.cantidad]);
        }

        await conexion.commit();
        await conexion.end();
        res.json({ exito: true, token: token });
    } catch (error) { 
        res.status(500).json({ error: 'Error en la transacción de compra.' }); 
    }
});

// ==========================================
// 4. REGISTRAR VENTA DE COSECHA
// ==========================================
app.post('/api/vender', async (req, res) => {
    try {
        const { id_cliente, kiosco_entrega, metodo_recepcion, productos } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        await conexion.beginTransaction();

        const token = "VN-" + Math.random().toString(36).substring(2, 6).toUpperCase();

        const [resultVenta] = await conexion.execute(
            'INSERT INTO venta_registro (id_cliente, kiosco_entrega, metodo_recepcion, token_digital) VALUES (?, ?, ?, ?)',
            [id_cliente, kiosco_entrega, metodo_recepcion, token]
        );
        const idVenta = resultVenta.insertId;

        for (let item of productos) {
            await conexion.execute('INSERT INTO venta_detalle (id_venta, id_producto, cantidad_ofrecida) VALUES (?, ?, ?)', [idVenta, item.id_producto, item.cantidad_ofrecida]);
        }

        await conexion.commit();
        await conexion.end();
        res.json({ exito: true, token: token });
    } catch (error) { 
        res.status(500).json({ error: 'Error al registrar la venta.' }); 
    }
});

// ==========================================
// 5. CANCELAR PEDIDO (CON MULTA)
// ==========================================
app.post('/api/cancelar-pedido', async (req, res) => {
    try {
        const { id_pedido } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        await conexion.execute(
            "UPDATE pedido SET estado = 'Cancelado', multa = 25.00, ubicacion = 'Operación Abortada' WHERE id_pedido = ?",
            [id_pedido]
        );
        await conexion.end();
        res.json({ exito: true, mensaje: 'Pedido cancelado. Se aplicó multa por gestión.' });
    } catch (error) { 
        res.status(500).json({ error: 'Error al cancelar el pedido.' }); 
    }
});

// ==========================================
// 6. OBTENER HISTORIAL DE PEDIDOS
// ==========================================
app.get('/api/mis-pedidos/:id', async (req, res) => {
    try {
        const conexion = await mysql.createConnection(dbConfig);
        const [filas] = await conexion.execute(
            'SELECT * FROM pedido WHERE id_cliente = ? ORDER BY id_pedido DESC', 
            [req.params.id]
        );
        await conexion.end();
        res.json(filas);
    } catch (error) { 
        res.status(500).json({ error: 'Error al obtener el historial de pedidos.' }); 
    }
});

// ==========================================
// 7. EDITAR TIPO DE ENTREGA
// ==========================================
app.post('/api/editar-pedido', async (req, res) => {
    try {
        const { id_pedido, nuevo_tipo_entrega } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        await conexion.execute(
            "UPDATE pedido SET tipo_entrega = ? WHERE id_pedido = ? AND estado = 'Preparando'",
            [nuevo_tipo_entrega, id_pedido]
        );
        await conexion.end();
        res.json({ exito: true, mensaje: 'Método de entrega actualizado con éxito.' });
    } catch (error) { 
        res.status(500).json({ error: 'Error al editar el pedido.' }); 
    }
});

// ==========================================
// 8. REGISTRAR NUEVA CUENTA DE CLIENTE
// ==========================================
app.post('/api/registro', async (req, res) => {
    try {
        const { nombre, correo, password } = req.body;
        const conexion = await mysql.createConnection(dbConfig);
        
        // 1. Validar que el correo no exista ya
        const [existe] = await conexion.execute('SELECT * FROM cliente WHERE correo = ?', [correo]);
        if (existe.length > 0) {
            await conexion.end();
            return res.status(400).json({ error: 'Este correo ya tiene una cuenta registrada.' });
        }
        
        // 2. Inyección segura con campos por defecto para evitar ER_NO_DEFAULT_FOR_FIELD
        await conexion.execute(
            'INSERT INTO cliente (nombre, correo, password, direccion, nivel_tecnologico) VALUES (?, ?, ?, ?, ?)',
            [nombre, correo, password, 'No especificada', 'Básico']
        );
        
        await conexion.end();
        res.json({ exito: true, mensaje: '¡Cuenta creada con éxito! Ya puedes iniciar sesión.' });
    } catch (error) { 
        console.error("Error en servidor al registrar:", error);
        res.status(500).json({ error: 'Error al registrar la cuenta en la base de datos.' }); 
    }
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API corriendo en el puerto ${PORT}`));