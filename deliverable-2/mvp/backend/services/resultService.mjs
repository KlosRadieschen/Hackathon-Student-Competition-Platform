// Participant-facing result logic.
// Results remain hidden until the organizer explicitly publishes them.
export function createResultService(challenges, teams, results) {
  return {
    // Return the current participant team's published result, if one exists.
    myResults(userId) {
      const team = teams.findForUser(userId);
      if (!team) return [];

      const publishedChallenges = challenges.list().filter((challenge) => challenge.status === 'published');
      const visible = [];

      for (const challenge of publishedChallenges) {
        const row = results.ranking(challenge.id).find((entry) => Number(entry.teamId) === Number(team.id));
        if (!row) continue;
        visible.push({
          challengeId: challenge.id,
          challengeTitle: challenge.title,
          publishedAt: challenge.published_at,
          position: Number(row.position),
          provisionalScore: Number(row.provisionalScore),
          evaluationCount: Number(row.evaluationCount),
          scoreMeaning: 'D2 MVP provisional ranking: average of judge weighted totals',
          feedback: results.feedbackForTeam(team.id, challenge.id)
        });
      }

      return visible;
    }
  };
}
