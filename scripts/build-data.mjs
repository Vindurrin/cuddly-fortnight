#!/usr/bin/env node
// Builds data/questions.json and data/modules.json from:
//   - the CloudCertPrep CLF-C02 question bank (MIT licensed, see NOTICE.md)
//   - the authored glossary in scripts/glossary.mjs
//
// Usage: node scripts/build-data.mjs <path-to-cloudcertprep-checkout>
//
// The upstream bank has no task-statement tags, so each question is tagged here
// with a best-guess exam task statement and the services it mentions. Tagging
// is heuristic (keyword scoring); it exists to slice progress, not to certify
// coverage. Untagged questions keep their domain and land in "General".

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SERVICES, CONCEPTS } from './glossary.mjs'
import { DOMAINS, TASKS } from './exam-guide.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const KEYWORDS = {
  '1.1': /advantage|benefit|agility|economies of scale|elastic|global reach|pay[- ]as[- ]you[- ]go|guess(ing)? capacity|variable expense|scalab/i,
  '1.2': /Well-Architected|pillar|high availab|fault.toler|loosely coupled|loose coupling|design principle|resilien|reliab|disposable|serverless|automation/i,
  '1.3': /migrat|Cloud Adoption Framework|\bCAF\b|rehost|replatform|refactor|lift.and.shift|repurchase|relocate/i,
  '1.4': /CapEx|capital expen|OpEx|operating expen|\bTCO\b|total cost of ownership|cost sav|right.siz|licens|fixed cost|variable cost/i,
  '2.1': /shared responsibility|responsib/i,
  '2.2': /complian|governance|audit|regulat|\bSOC\b|\bISO\b|HIPAA|GDPR|PCI|CloudTrail|AWS Config|data residency|AWS Artifact/i,
  '2.3': /\bIAM\b|identity|\bMFA\b|multi-factor|least privilege|root user|access key|\broles?\b|polic(y|ies)|permission|authenticat|authoriz|credential|single sign-on|Cognito/i,
  '2.4': /encrypt|firewall|security group|network ACL|DDoS|vulnerab|threat|\bWAF\b|Shield|\bKMS\b|GuardDuty|Inspector|Macie|certificate|secret|Security Hub|penetration/i,
  '3.1': /Management Console|\bCLI\b|\bSDKs?\b|\bAPIs?\b|infrastructure as code|CloudFormation|hybrid|deployment model|on-premises|provision/i,
  '3.2': /\bRegions?\b|Availability Zone|\bAZs?\b|edge location|Local Zone|Wavelength|global infrastructure|data cent(er|re)/i,
  '3.5': /subnet|internet gateway|\bNAT\b|route table|network ACL|\bDNS\b|\bCDN\b|latency/i,
  '4.1': /pricing model|On-Demand|Reserved|Savings Plan|\bSpot\b|Dedicated|free tier|pay.as.you.go|data transfer|volume discount|per.second|per.hour|discount|pricing/i,
  '4.2': /Budgets|Cost Explorer|Cost and Usage|Pricing Calculator|consolidated billing|cost allocation|\btags?\b|\bbill(ing)?\b|invoice|forecast|cost management|Marketplace|credits/i,
  '4.3': /Support|Trusted Advisor|\bTAM\b|Technical Account|Professional Services|Partner|re:Post|Knowledge Center|documentation|whitepaper|Concierge|Prescriptive|Skill Builder|Health Dashboard/i,
}

const CITES_LETTER = /\b(option|choice|answer)s?\s+[A-E]\b|\(\s*[A-E]\s*\)|\b[A-E]\)/i

const serviceRes = SERVICES.map(s => ({ id: s.id, task: s.task, re: new RegExp(s.match) }))

function tag(q, domain) {
  const [p1] = q.explanation.split('\n')
  const correct = (Array.isArray(q.answer) ? q.answer : [q.answer]).map(k => q.options[k]).join(' ')
  const primary = `${q.question} ${correct}`
  const secondary = `${Object.values(q.options).join(' ')} ${p1}`
  const candidates = TASKS.filter(t => t.domainId === domain).map(t => t.id)
  const score = Object.fromEntries(candidates.map(id => [id, 0]))
  const services = []

  for (const s of serviceRes) {
    const inPrimary = s.re.test(primary)
    const inAny = inPrimary || s.re.test(secondary)
    if (!inAny) continue
    services.push({ id: s.id, primary: inPrimary })
    if (s.task in score) score[s.task] += inPrimary ? 3 : 1
  }
  for (const id of candidates) {
    const re = KEYWORDS[id]
    if (!re) continue
    if (re.test(q.question)) score[id] += 3
    if (re.test(correct)) score[id] += 2
    if (re.test(secondary)) score[id] += 1
  }

  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1])
  const best = ranked[0]
  const task = best && best[1] >= 3 && (!ranked[1] || best[1] > ranked[1][1]) ? best[0] : null
  return {
    task,
    services: services.filter(s => s.primary).map(s => s.id),
  }
}

function build(srcDir) {
  const questions = []
  for (const d of DOMAINS) {
    const rows = JSON.parse(readFileSync(join(srcDir, 'src/data/clf-c02', `domain${d.id}.json`), 'utf8'))
    for (const q of rows) {
      if (q.type && q.type !== 'single') throw new Error(`unsupported question type: ${q.id}`)
      const answer = Array.isArray(q.answer) ? q.answer : [q.answer]
      if (!answer.every(k => k in q.options)) throw new Error(`bad answer key: ${q.id}`)
      const { task, services } = tag(q, d.id)
      questions.push({
        id: q.id,
        domain: d.id,
        task: q.taskStatement && TASKS.some(t => t.id === q.taskStatement) ? q.taskStatement : task,
        question: q.question,
        options: q.options,
        answer,
        explanation: q.explanation.split('\n').filter(Boolean),
        services,
        // Explanations that cite an option by letter break if options are shuffled.
        ...(CITES_LETTER.test(q.explanation) ? { fixedOrder: true } : {}),
      })
    }
  }
  return questions
}

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/build-data.mjs <path-to-cloudcertprep-checkout>')
  process.exit(1)
}
const questions = build(resolve(src))
mkdirSync(join(root, 'data'), { recursive: true })
writeFileSync(join(root, 'data/questions.json'), JSON.stringify(questions))

const modules = {
  domains: DOMAINS,
  tasks: TASKS,
  services: SERVICES.map(({ match, ...s }) => s),
  concepts: CONCEPTS,
}
writeFileSync(join(root, 'data/modules.json'), JSON.stringify(modules))

const tagged = questions.filter(q => q.task).length
const perTask = {}
for (const q of questions) perTask[q.task ?? 'general'] = (perTask[q.task ?? 'general'] ?? 0) + 1
console.log(`questions: ${questions.length}, task-tagged: ${tagged} (${Math.round((tagged / questions.length) * 100)}%)`)
console.log('per task:', JSON.stringify(perTask))
console.log(`services: ${SERVICES.length}, concepts: ${CONCEPTS.length}`)
