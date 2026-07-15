import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn('⚠️ MONGODB_URI not found in environment. Please add it to your .env file or environment variables.');
  console.warn('⚠️ Example: MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/basic_box');
}

mongoose.connect(MONGODB_URI || 'mongodb://localhost:27017/basic_box')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const models = {};

function getModel(collectionName) {
  if (models[collectionName]) return models[collectionName];
  const schema = new mongoose.Schema({ id: Number, created_at: String, updated_at: String }, { strict: false, versionKey: false });
  models[collectionName] = mongoose.model(collectionName, schema, collectionName);
  return models[collectionName];
}

const CounterSchema = new mongoose.Schema({ _id: String, value: Number });
const CounterModel = mongoose.model('_counters', CounterSchema, '_counters');

const getNextId = async (collection) => {
  const counter = await CounterModel.findByIdAndUpdate(
    collection,
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return counter.value;
};

const docToObj = (doc) => {
  if (!doc) return null;
  const obj = doc.toObject();
  delete obj._id;
  return obj;
};

export const DB = {
  query: async (collection, whereFilters = [], orderBy = null) => {
    const Model = getModel(collection);
    const query = {};
    if (Array.isArray(whereFilters)) {
      for (const f of whereFilters) {
        if (f.op === '==') query[f.field] = f.value;
        else if (f.op === '>') query[f.field] = { $gt: f.value };
        else if (f.op === '<') query[f.field] = { $lt: f.value };
        else if (f.op === '>=') query[f.field] = { $gte: f.value };
        else if (f.op === '<=') query[f.field] = { $lte: f.value };
      }
    }
    let mq = Model.find(query);
    if (orderBy) {
      mq = mq.sort({ [orderBy.field]: orderBy.direction === 'desc' ? -1 : 1 });
    }
    const docs = await mq.exec();
    return docs.map(docToObj);
  },

  findOne: async (collection, whereFilters = []) => {
    const Model = getModel(collection);
    const query = {};
    if (Array.isArray(whereFilters)) {
      for (const f of whereFilters) {
        if (f.op === '==') query[f.field] = f.value;
        else if (f.op === '>') query[f.field] = { $gt: f.value };
        else if (f.op === '<') query[f.field] = { $lt: f.value };
        else if (f.op === '>=') query[f.field] = { $gte: f.value };
        else if (f.op === '<=') query[f.field] = { $lte: f.value };
      }
    }
    const doc = await Model.findOne(query).exec();
    return docToObj(doc);
  },

  getById: async (collection, id) => {
    const Model = getModel(collection);
    const doc = await Model.findOne({ id: Number(id) }).exec();
    return docToObj(doc);
  },

  insert: async (collection, record) => {
    const numId = await getNextId(collection);
    const now = new Date().toISOString();
    const data = {
      id: numId,
      created_at: now,
      updated_at: now,
      ...record,
    };
    const Model = getModel(collection);
    await Model.create(data);
    return data;
  },

  update: async (collection, id, updates) => {
    const Model = getModel(collection);
    const mergeData = { ...updates, updated_at: new Date().toISOString() };
    const doc = await Model.findOneAndUpdate(
      { id: Number(id) },
      { $set: mergeData },
      { new: true }
    ).exec();
    return docToObj(doc);
  },

  delete: async (collection, id) => {
    const Model = getModel(collection);
    const res = await Model.deleteOne({ id: Number(id) }).exec();
    return res.deletedCount > 0;
  },

  clearTable: async (collection) => {
    const Model = getModel(collection);
    await Model.deleteMany({}).exec();
    await CounterModel.deleteOne({ _id: collection }).exec();
  },
};
