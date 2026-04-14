import chalk from 'chalk';
import { SkillManager } from '../core/skills.js';

type SkillsOptions = {
  profile?: string;
};

function formatProvenance(p?: string): string {
  if (!p) return '';
  return chalk.dim(` (${p})`);
}

export async function skillsCommand(action: string | undefined, args: string[], options: SkillsOptions) {
  const manager = new SkillManager(process.cwd());
  await manager.loadSkills();

  // skills sh ...
  if (String(action || '').toLowerCase() === 'sh') {
    const sub = (args[0] || 'search').toLowerCase();
    const rest = args.slice(1);

    if (sub === 'search' || sub === 'find') {
      const query = rest.join(' ').trim();
      if (!query) {
        console.log(chalk.red('Missing query.'));
        console.log(chalk.dim('Usage: xibecode skills sh search <query>'));
        return;
      }
      const results = await manager.searchSkillsSh(query);
      console.log(chalk.hex('#00D4FF').bold(`\nskills.sh search: "${query}" (${results.length})\n`));
      for (const r of results) {
        console.log(`- ${chalk.white(r.id)}${r.url ? chalk.dim(` — ${r.url}`) : ''}`);
      }
      console.log('');
      console.log(chalk.dim('Install one with: xibecode skills sh install <id>'));
      return;
    }

    if (sub === 'install' || sub === 'add') {
      const id = rest[0];
      if (!id) {
        console.log(chalk.red('Missing skill id.'));
        console.log(chalk.dim('Usage: xibecode skills sh install <owner/repo@skill>'));
        return;
      }
      console.log(chalk.dim(`Installing from skills.sh: ${id} ...`));
      const result = await manager.installFromSkillsSh(id);
      if (!result.success) {
        console.log(chalk.red(`Install failed: ${result.message || 'unknown error'}`));
        return;
      }
      console.log(chalk.green('Installed.'));
      if (result.filePath) console.log(chalk.dim(`Saved: ${result.filePath}`));
      console.log(chalk.dim('Tip: run `xibecode skills list`'));
      return;
    }

    console.log(chalk.red(`Unknown subcommand: sh ${sub}`));
    console.log(chalk.dim('Usage: xibecode skills sh <search|install> ...'));
    return;
  }

  const verb = (action || 'list').toLowerCase();

  if (verb === 'list') {
    const skills = manager
      .listSkills()
      .sort((a, b) => a.name.localeCompare(b.name));
    if (skills.length === 0) {
      console.log(chalk.yellow('No skills found.'));
      console.log(chalk.dim('Add local skills under .xibecode/skills/*.md'));
      return;
    }
    console.log(chalk.hex('#00D4FF').bold(`\nSkills (${skills.length})\n`));
    for (const s of skills) {
      console.log(`- ${chalk.white(s.name)}${formatProvenance(s.provenance)}${s.description ? chalk.dim(` — ${s.description}`) : ''}`);
    }
    console.log('');
    console.log(chalk.dim('Use in chat/run prompts like: "Use the <skill-name> skill and ...".'));
    return;
  }

  if (verb === 'search') {
    const query = args.join(' ').trim();
    if (!query) {
      console.log(chalk.red('Missing query.'));
      console.log(chalk.dim('Usage: xibecode skills search <query>'));
      return;
    }
    const results = manager.searchSkills(query).sort((a, b) => a.name.localeCompare(b.name));
    console.log(chalk.hex('#00D4FF').bold(`\nSkill search: "${query}" (${results.length})\n`));
    for (const s of results) {
      console.log(`- ${chalk.white(s.name)}${formatProvenance(s.provenance)}${s.description ? chalk.dim(` — ${s.description}`) : ''}`);
    }
    console.log('');
    return;
  }

  if (verb === 'show') {
    const name = args.join(' ').trim();
    if (!name) {
      console.log(chalk.red('Missing skill name.'));
      console.log(chalk.dim('Usage: xibecode skills show <name>'));
      return;
    }
    const skill = manager.getSkill(name);
    if (!skill) {
      console.log(chalk.red(`Skill not found: ${name}`));
      console.log(chalk.dim('Tip: run `xibecode skills list`'));
      return;
    }
    console.log(chalk.hex('#00D4FF').bold(`\n${skill.name}${formatProvenance(skill.provenance)}\n`));
    if (skill.description) console.log(chalk.dim(skill.description) + '\n');
    console.log(skill.instructions.trim() + '\n');
    return;
  }

  console.log(chalk.red(`Unknown action: ${verb}`));
  console.log(chalk.dim('Usage: xibecode skills <list|search|show> [args...]'));
}

