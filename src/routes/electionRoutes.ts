import { Router } from 'express';
import { authenticate, requireRole } from '../auth/middleware';
import { TokenService } from '../auth/tokenService';
import { NotFoundError } from '../errors';
import { CandidateRepository } from '../repositories/candidateRepository';
import { DistrictRepository } from '../repositories/districtRepository';
import { PartyRepository } from '../repositories/partyRepository';
import { ElectionAdminService } from '../services/electionAdminService';
import { PollService } from '../services/pollService';

interface ElectionRouteDeps {
  admin: ElectionAdminService;
  poll: PollService;
  districts: DistrictRepository;
  parties: PartyRepository;
  candidates: CandidateRepository;
  tokens: TokenService;
}

export function electionRoutes({ admin, poll, districts, parties, candidates, tokens }: ElectionRouteDeps): Router {
  const router = Router();
  const commissionerOnly = [authenticate(tokens), requireRole('COMMISSIONER')];

  router.get('/districts', async (_req, res) => {
    res.json(await districts.findAll());
  });

  router.get('/parties', async (_req, res) => {
    res.json(await parties.findAll());
  });

  router.get('/parties/:id', async (req, res) => {
    const party = await parties.findById(Number(req.params.id));
    if (!party) throw new NotFoundError('party not found');
    res.json({ ...party, candidates: await candidates.findByParty(party.id) });
  });

  router.post('/parties', ...commissionerOnly, async (req, res) => {
    res.status(201).json(await admin.createParty(req.body ?? {}));
  });

  router.post('/districts/:id/candidates', ...commissionerOnly, async (req, res) => {
    res.status(201).json(await admin.addCandidate(req.params.id as string, req.body ?? {}));
  });

  router.post('/districts/:id/close', ...commissionerOnly, async (req, res) => {
    res.json(await poll.close(req.params.id as string));
  });

  // Public results. The service decides what may be shown: scores stay hidden until the poll is closed.
  router.get('/districts/:id/results', async (req, res) => {
    res.json(await poll.resultsFor(req.params.id as string));
  });

  return router;
}
