import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { notFound, parse } from '../lib/errors';
import { publicStore, resolveLocation, serviceableStores } from '../services/serviceability';
import { VERTICALS } from '@padosi/shared';

export const locationsRouter = Router();

locationsRouter.get('/cities', async (_req, res) => {
  const cities = await prisma.city.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  res.json({ cities });
});

locationsRouter.get('/cities/:cityId/localities', async (req, res) => {
  const localities = await prisma.locality.findMany({
    where: { cityId: String(req.params.cityId) },
    include: { zone: { select: { isActive: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({
    localities: localities.map((l) => ({ id: l.id, name: l.name, postalCode: l.postalCode, lat: l.lat, lng: l.lng, serviceable: !!l.zone?.isActive })),
  });
});

locationsRouter.get('/pincode/:pin', async (req, res) => {
  const localities = await prisma.locality.findMany({ where: { postalCode: String(req.params.pin) }, include: { city: true, zone: true } });
  if (!localities.length) throw notFound('PIN code');
  res.json({
    localities: localities.map((l) => ({ id: l.id, name: l.name, city: { id: l.city.id, name: l.city.name }, postalCode: l.postalCode, lat: l.lat, lng: l.lng, serviceable: !!l.zone?.isActive && l.city.isActive })),
  });
});

export const locationQuery = z.object({
  localityId: z.string().min(1),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  vertical: z.enum(VERTICALS).optional(),
});

/** Serviceability check for a location: which stores deliver there and how fast (estimate). */
locationsRouter.get('/serviceability', async (req, res) => {
  const q = parse(locationQuery, req.query);
  const { locality, serviceable } = await resolveLocation(q);
  const stores = await serviceableStores(q, q.vertical);
  res.json({
    locality: { id: locality.id, name: locality.name, city: locality.city.name, postalCode: locality.postalCode },
    serviceable: serviceable && stores.length > 0,
    reason: !serviceable ? 'We do not deliver to this area yet' : stores.length === 0 ? 'No stores deliver here yet' : null,
    stores: stores.map(publicStore),
  });
});
