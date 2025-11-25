const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session Configuration
app.use(session({
    secret: 'crm-mock-secret-key', // In production, use a secure random string
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Authentication Middleware
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
};

// MongoDB Connection
const mongoURI = 'mongodb://root:root@localhost:27017/crm-mock?authSource=admin';

mongoose.connect(mongoURI)
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Connection Error:', err));

// Schema
const pvcSchema = new mongoose.Schema({
    name: { type: String, required: true },
    size: { type: String, required: true },
    accessMode: { type: String, required: true, enum: ['ReadWriteOnce', 'ReadOnlyMany', 'ReadWriteMany'] },
    owner: { type: String, required: true },
    group: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
    vcpu: { type: Number, required: true, min: 1, max: 32 },
    memory: { type: Number, required: true, min: 1, max: 64 },
    storage: { type: Number, required: true, min: 1, max: 500 },
    pvc: { type: mongoose.Schema.Types.ObjectId, ref: 'PVC' },
    requester: { type: String, required: true },
    group: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const PVC = mongoose.model('PVC', pvcSchema);
const ResourceRequest = mongoose.model('ResourceRequest', requestSchema);

// Routes

// Login Routes
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Hardcoded credential check
    if (username === 'user1' && password === 'pass') {
        req.session.user = {
            username: 'user1',
            group: 'setic'
        };
        res.redirect('/');
    } else {
        res.render('login', { error: 'Invalid credentials' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Error destroying session:', err);
        res.redirect('/login');
    });
});

// GET / - Render form (Protected)
app.get('/', isAuthenticated, async (req, res) => {
    try {
        const requests = await ResourceRequest.find().populate('pvc').sort({ createdAt: -1 });
        const pvcs = await PVC.find();
        res.render('index', { requests, pvcs, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /requests - Handle form submission (Protected)
app.post('/requests', isAuthenticated, async (req, res) => {
    const { vcpu, memory, storage, createNewPvc, pvcId, pvcName, pvcSize, pvcAccessMode } = req.body;
    const { username, group } = req.session.user;
    
    try {
        let pvcObjectId = null;

        // Handle PVC
        if (createNewPvc === 'true') {
            // Create new PVC
            const newPvc = new PVC({
                name: pvcName,
                size: pvcSize,
                accessMode: pvcAccessMode,
                owner: username,
                group: group
            });
            const savedPvc = await newPvc.save();
            pvcObjectId = savedPvc._id;
        } else if (pvcId) {
            // Use existing PVC
            pvcObjectId = pvcId;
        }

        const newRequest = new ResourceRequest({
            vcpu,
            memory,
            storage,
            pvc: pvcObjectId,
            requester: username,
            group: group
        });
        await newRequest.save();
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(400).send('Error saving request');
    }
});

// GET /requests/:id/edit - Render edit form (Protected)
app.get('/requests/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const request = await ResourceRequest.findById(req.params.id).populate('pvc');
        if (!request) return res.status(404).send('Request not found');
        const pvcs = await PVC.find();
        res.render('edit', { request, pvcs, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /requests/:id/update - Handle update (Protected)
app.post('/requests/:id/update', isAuthenticated, async (req, res) => {
    const { vcpu, memory, storage, createNewPvc, pvcId, pvcName, pvcSize, pvcAccessMode } = req.body;
    const { username, group } = req.session.user;
    
    try {
        let pvcObjectId = null;

        // Handle PVC (similar to create)
        if (createNewPvc === 'true') {
            // Create new PVC
            const newPvc = new PVC({
                name: pvcName,
                size: pvcSize,
                accessMode: pvcAccessMode,
                owner: username,
                group: group
            });
            const savedPvc = await newPvc.save();
            pvcObjectId = savedPvc._id;
        } else if (pvcId) {
            // Use existing PVC
            pvcObjectId = pvcId;
        }

        const updateData = {
            vcpu,
            memory,
            storage
        };

        // Only update PVC if a new one was created or an existing one selected (and not explicitly empty if optional)
        // Assuming PVC is optional or required, if optional:
        if (pvcObjectId) {
            updateData.pvc = pvcObjectId;
        } else if (pvcId === "") {
             // Explicitly removed (if allowed)
             updateData.pvc = null;
        }

        await ResourceRequest.findByIdAndUpdate(req.params.id, updateData);
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(400).send('Error updating request');
    }
});

// POST /requests/:id/delete - Handle delete (Protected)
app.post('/requests/:id/delete', isAuthenticated, async (req, res) => {
    try {
        await ResourceRequest.findByIdAndDelete(req.params.id);
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting request');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
