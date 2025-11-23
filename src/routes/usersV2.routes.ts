// src/routes/usersV2.routes.ts
// 🎯 SPRINT 5.2 - Users V2 Routes

import { Router } from 'express';
import {
  getUsers,
  getUserById,
  getUsersByProduct,
  getUserByEmail,
  createUser,
  getUsersStats,
  getUserProducts
} from '../controllers/usersV2.controller';

const router = Router();

// Stats (deve vir antes de :id para evitar conflito)
router.get('/stats/overview', getUsersStats);

// By filters
router.get('/by-product/:productId', getUsersByProduct);
router.get('/by-email/:email', getUserByEmail);

// User products (deve vir antes de /:id para evitar conflito)
router.get('/:userId/products', getUserProducts);

// CRUD
router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', createUser);

export default router;

