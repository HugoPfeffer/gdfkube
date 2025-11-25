const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB Connection
const mongoURI = 'mongodb://root:root@localhost:27017/crm-mock?authSource=admin';

mongoose.connect(mongoURI)
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Connection Error:', err));

// Schema
const requestSchema = new mongoose.Schema({
    vcpu: { type: Number, required: true, min: 1, max: 32 },
    memory: { type: Number, required: true, min: 1, max: 64 },
    storage: { type: Number, required: true, min: 1, max: 500 },
    requester: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const ResourceRequest = mongoose.model('ResourceRequest', requestSchema);

// Routes

// GET / - Render form
app.get('/', async (req, res) => {
    try {
        const requests = await ResourceRequest.find().sort({ createdAt: -1 });
        res.render('index', { requests });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /submit - Handle form submission
app.post('/submit', async (req, res) => {
    const { vcpu, memory, storage, requester } = req.body;
    
    try {
        const newRequest = new ResourceRequest({
            vcpu,
            memory,
            storage,
            requester
        });
        await newRequest.save();
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(400).send('Error saving request');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

