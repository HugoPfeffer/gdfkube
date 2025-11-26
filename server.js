const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 8080;

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
const mongoURI = process.env.MONGODB_URI || 'mongodb://root:root@localhost:27017/crm-mock?authSource=admin';

mongoose.connect(mongoURI)
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Connection Error:', err));

// Schema
const requestSchema = new mongoose.Schema({
    machineName: { type: String, required: true, maxlength: 50 },
    instanceType: { type: String, required: true, enum: ['u1.large', 'u1.xlarge'] },
    dataVolume: { type: String, required: true },
    requester: { type: String, required: true },
    group: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

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
        const requests = await ResourceRequest.find().sort({ createdAt: -1 });
        res.render('index', { requests, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /requests - Handle form submission (Protected)
app.post('/requests', isAuthenticated, async (req, res) => {
    const { machineName, instanceType, dataVolume } = req.body;
    const { username, group } = req.session.user;
    
    try {
        const newRequest = new ResourceRequest({
            machineName,
            instanceType,
            dataVolume,
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
        const request = await ResourceRequest.findById(req.params.id);
        if (!request) return res.status(404).send('Request not found');
        res.render('edit', { request, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /requests/:id/update - Handle update (Protected)
app.post('/requests/:id/update', isAuthenticated, async (req, res) => {
    const { machineName, instanceType, dataVolume } = req.body;
    
    try {
        const updateData = {
            machineName,
            instanceType,
            dataVolume
        };

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
