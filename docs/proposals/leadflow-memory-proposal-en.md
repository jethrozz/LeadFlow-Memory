# LeadFlow Memory Proposal

## Project Name

**LeadFlow Memory**

## Tagline

**Verifiable long-term memory for real estate sales agents, powered by Walrus and MemWal.**

## One-liner

LeadFlow Memory gives real estate sales agents portable, recoverable, and verifiable long-term customer memory from lead discovery to multi-touch conversion.

## Background

AI agents are evolving from one-shot assistants into long-running business workflows. But in real sales operations, agents are still fragmented and forgetful.

Real estate sales is a strong example. A buyer journey may last days or weeks. A sales agent needs to remember budget, location preferences, layout requirements, school district needs, commute constraints, family context, down payment concerns, previous objections, and the next follow-up strategy.

Today, these workflows are usually siloed:

- Lead discovery agents find potential customers.
- Conversion agents handle private messages and follow-ups.
- Databases store structured rows, but not semantic memory that agents can naturally recall.
- When a worker restarts, a model changes, or a task is reassigned, context is easily lost.
- It is hard to verify why an agent scored a lead as high-intent or why it sent a specific follow-up message.

## Problem

High-consideration sales is not a single chat. It is a long-running workflow that requires memory, continuity, trust, and accountability.

LeadFlow Memory solves this problem:

> How can multiple agents share the same verifiable, recoverable, and continuously updated customer memory from lead discovery to conversion?

## Solution

LeadFlow Memory uses **MemWal** as the long-term semantic memory layer for agents and **Walrus** as the verifiable artifact storage layer.

The system connects two agent workflows:

```text
Lead Discovery Agent
Finds potential real estate buyers
-> extracts buying intent
-> writes customer memory to MemWal
-> stores source evidence and scoring reports on Walrus

Lead Conversion Agent
Reads pending leads
-> recalls customer context from MemWal
-> generates personalized follow-up messages
-> updates memory after each customer interaction
-> stores conversations, traces, and reports on Walrus
```

## Demo Scenario

The demo focuses on real estate sales.

A Discovery Agent finds a potential buyer from Xiaohongshu:

> "I want to buy a three-bedroom apartment near the high-tech district. The price should not be too high, and commuting should be convenient."

The agent extracts a customer profile:

```text
Budget: around 1.2M-1.5M
Location: near the high-tech district
Layout: three-bedroom apartment
Purpose: self-use
Main concerns: price and commuting
Recommended strategy: suggest affordable three-bedroom listings near metro lines
```

This profile is written into MemWal as the lead's initial long-term memory. The source post, extraction report, and lead scoring report are stored on Walrus.

Later, the Conversion Agent reads the lead and recalls the memory from MemWal. It generates a personalized opening message:

> "You mentioned that you are looking for a three-bedroom apartment near the high-tech district with convenient commuting. I can first filter a few options with controlled total price for you."

The customer replies:

> "My budget is ideally under 1.3M, and my child will start primary school next year."

The agent updates the memory:

```text
Budget upper limit: 1.3M
New priority: school district
Updated strategy: recommend homes under 1.3M that balance metro access and school district needs
```

Then Worker-1 crashes. Worker-2 takes over the same lead, recalls the context from MemWal, and continues naturally:

> "I re-filtered the options based on your updated requirements: under 1.3M, close to school, and near metro access."

## Core Features

### 1. Lead Memory Space

Each lead has a persistent memory space that stores budget, location, layout, family needs, concerns, timeline, conversation summaries, and the next follow-up strategy.

### 2. Cross-Agent Handoff

The Discovery Agent and Conversion Agent share the same customer context. Different workers can also take over a task without losing memory.

### 3. Verifiable Artifact Trail

Walrus stores the artifacts generated throughout the workflow, including source evidence, extraction reports, scoring reports, conversation logs, agent execution traces, follow-up summaries, and handoff records.

### 4. Memory Inspector Dashboard

The dashboard shows the full customer lifecycle:

```text
Discovered -> Scored -> Contacted -> Replied -> Memory Updated -> Handoff
```

Each event can show:

- MemWal memory read or written during the event
- Related Walrus artifact and blob ID
- Agent decision rationale
- Tool calls
- Current follow-up status

## Why Walrus / MemWal

MemWal gives agents recallable semantic memory across sessions, workflows, and workers.

Walrus stores durable and verifiable artifacts that prove where memory came from, what the agent did, and what each decision was based on.

Without Walrus, this is just a sales automation bot. With Walrus and MemWal, it becomes a recoverable, auditable, long-running agent workflow.

## Walrus Track Alignment

### Long-term Memory

Customer budget, location, layout, school district needs, commute constraints, concerns, and follow-up strategy are continuously updated across multiple interactions.

### Multi-Agent Coordination

The Discovery Agent and Conversion Agent share context through the same customer memory space.

### Artifact-driven Workflow

Source evidence, extraction reports, scoring reports, conversation logs, recommendation rationales, and execution traces are stored as Walrus artifacts.

### Persistent Data and File Access

Future agents can read historical reports, conversation logs, and source evidence to continue long-running tasks.

### Developer Tooling

The Memory Inspector Dashboard helps developers inspect, debug, and manage agent memory and Walrus artifacts.

## MVP Scope

The hackathon MVP focuses on one complete loop:

1. Import or search three real estate leads.
2. Discovery Agent extracts buying intent.
3. Initial customer memory is written to MemWal.
4. Source evidence and scoring reports are stored on Walrus.
5. Conversion Agent recalls customer memory.
6. The agent generates a personalized follow-up message.
7. A simulated customer reply updates the memory.
8. A worker handoff is simulated.
9. The dashboard shows the memory timeline, Walrus artifacts, and agent trace.

Out of scope for the MVP:

- Full CRM system
- Large-scale real crawling
- Multi-account bulk messaging
- Complex permission system
- Monetization or billing

## Technical Architecture

```text
xhs-lead-crawler
├── lead-crawler-agent
├── mcp-xhs-search
├── mcp-db-writer
├── MemWal writer
└── Walrus artifact uploader

xhs-lead-converter
├── lead-converter-agent
├── mcp-db-reader
├── mcp-xhs-chat
├── MemWal recall/update
└── Walrus trace/report uploader

LeadFlow Dashboard
├── Lead timeline
├── Memory inspector
├── Artifact inspector
└── Agent trace viewer
```

## Future Expansion

LeadFlow Memory can expand from real estate into other high-consideration sales workflows:

- Automotive sales
- Home renovation services
- Education consulting
- Insurance advisory
- B2B SaaS sales
- Medical aesthetics consulting

The industry can change, but the workflow stays the same:

```text
discover lead -> extract intent -> store memory -> convert over time -> verify decisions
```

## Final Pitch

> LeadFlow Memory gives real estate sales agents portable, verifiable long-term memory from lead discovery to multi-touch conversion, powered by Walrus and MemWal.

## Chinese Pitch

> LeadFlow Memory 让房产销售 Agent 从线索发现到多轮转化的全过程拥有可携带、可恢复、可验证的长期客户记忆。
