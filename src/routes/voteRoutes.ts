import { Router } from 'express';
import { authenticate, principalOf } from '../auth/middleware';
import { TokenService } from '../auth/tokenService';
import { VoteService } from '../services/voteService';

export interface VoteRouteDeps {
  votes: VoteService;
  tokens: TokenService;
}

/** Only HTTP here: read the request, call the service, choose the status code. The rules live in VoteService. */
export function voteRoutes({ votes, tokens }: VoteRouteDeps): Router {
  const router = Router();
  const loggedIn = authenticate(tokens);

  router.get('/me/candidates', loggedIn, async (_req, res) => {
    res.json(await votes.choices(principalOf(res)));
  });

  router.put('/me/vote', loggedIn, async (req, res) => {
    const receipt = await votes.cast(principalOf(res), req.body?.candidateId);
    res.status(receipt.changed ? 200 : 201).json(receipt);
  });

  return router;
}
