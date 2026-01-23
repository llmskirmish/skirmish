export const FIRST_ROUND_PROMPT = `<file path="OBJECTIVE.md">
{OBJECTIVE_MD}
</file>

Based on the OBJECTIVE.md above, create a game script at strategies/{model_name}/round_1.js

Design a winning strategy and write the complete JavaScript file.`;

export const NEXT_ROUND_PROMPT = `<file path="OBJECTIVE.md">
{OBJECTIVE_MD}
</file>

<file path="NEXT_ROUND.md">
{NEXT_ROUND_MD}
</file>

Review the match results from round_{prev_round}, then create your improved strategy at strategies/{model_name}/round_{round}.js`;

export const FINAL_ROUND_PROMPT = `<file path="OBJECTIVE.md">
{OBJECTIVE_MD}
</file>

<file path="NEXT_ROUND.md">
{NEXT_ROUND_MD}
</file>

This is the FINAL ROUND. Review results from round_4, then create your best strategy at strategies/{model_name}/round_5.js

Maximize your chances of winning.`;


export const VALIDATION_ERROR_PROMPT = `Your script strategies/{model_name}/round_{n}.js failed validation with the following error:

{error}

Please fix the script and save it again.`;