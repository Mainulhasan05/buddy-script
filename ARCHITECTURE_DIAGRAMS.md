# Buddy Script — Architecture Diagrams (clean version)

Simplified for presentation. Each diagram shows only what's needed to tell the story.
White background. Render: VS Code preview, or regenerate PNGs with the command at the bottom.

---

## 1. The Big Picture — who talks to whom

```mermaid
flowchart TB
    Browser["🖥️ Browser<br/>(Next.js app)"]
    API["⚙️ Backend API<br/>(Express)"]

    Mongo[("🍃 MongoDB<br/>permanent database")]
    Redis[("⚡ Redis<br/>fast memory cache")]
    Rabbit["🐰 RabbitMQ<br/>background task line"]
    Cloud["🖼️ Cloudinary<br/>image hosting"]
    Worker["🔄 Background Worker"]

    Browser <--> API
    API <-->|"read / write data"| Mongo
    API <-->|"cache: check first"| Redis
    API -->|"queue slow work"| Rabbit
    API -->|"upload images"| Cloud
    Rabbit --> Worker
    Worker -->|"update counts in bulk"| Mongo

    classDef brain fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#1e3a5f;
    classDef tool fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;
    class Browser,API brain;
    class Mongo,Redis,Rabbit,Cloud,Worker tool;
```

**Explain:** *"The browser talks to one backend API. The API uses four tools: MongoDB stores
everything permanently, Redis is a fast memory cache for reads, RabbitMQ queues slow work, and
Cloudinary hosts images. A background worker handles queued tasks so the API stays fast."*

---

## 2. Reading the Feed — check cache first

```mermaid
flowchart LR
    U["🖥️ Browser<br/>'show me posts'"] --> API["⚙️ API"]
    API --> Q{"In Redis<br/>cache?"}
    Q -->|"✅ yes (fast)"| Hit["return cached posts<br/>⚡ instant"]
    Q -->|"❌ no"| DB[("🍃 MongoDB<br/>fetch posts")]
    DB --> Save["save copy in Redis<br/>for next time"]
    Save --> Out["return posts"]
    Hit --> U
    Out --> U

    classDef fast fill:#dcfce7,stroke:#16a34a,color:#14532d;
    classDef slow fill:#fef9c3,stroke:#ca8a04,color:#713f12;
    class Hit fast;
    class DB,Save slow;
```

**Explain:** *"When you load the feed, the API checks Redis first. If the posts are cached, you get
them instantly. If not, it reads MongoDB once, saves a copy in Redis, and the next person hits the
fast path. Most reads never touch the database."*

---

## 3. Creating a Post — save, then refresh the cache

```mermaid
flowchart LR
    U["🖥️ Browser<br/>'new post'"] --> API["⚙️ API"]
    API -->|"image?"| Cloud["🖼️ Cloudinary<br/>store image"]
    API --> Save[("🍃 MongoDB<br/>save post")]
    Save --> Inv["⚡ Redis<br/>mark feed cache stale"]
    Inv --> Done["✅ done"]
    Done --> U

    classDef tool fill:#dcfce7,stroke:#16a34a,color:#14532d;
    class Cloud,Save,Inv tool;
```

**Explain:** *"Creating a post saves it to MongoDB, uploads any image to Cloudinary, then marks the
feed cache as stale so the new post shows up. Marking it stale is a single instant operation — I
don't delete every cached page one by one."*

---

## 4. Liking a Post — the smart part ⭐

Two DIFFERENT things get stored, not one thing twice:
- **WHO liked** → saved immediately (cheap: every like is a new row, no conflict).
- **The COUNT** (the number on the post) → updated later in bulk (expensive: every like hits the
  same row, so we batch to avoid hammering it).

```mermaid
flowchart TB
    U["🖥️ Browser taps ❤️<br/>count bumps on screen instantly<br/>(optimistic — before server replies)"] --> API["⚙️ API"]

    API -->|"① save WHO liked (fast)"| Save[("🍃 MongoDB · likes<br/>new row: 'A liked X'<br/>no two likes conflict")]
    API -->|"② note the count change"| Note["🐰 RabbitMQ<br/>'post X got +1'"]
    API -->|"③ reply"| Reply["✅ done — user waits only<br/>for ① , NOT for the count"]
    Reply --> U

    Note -.->|"later"| Worker["🔄 Worker<br/>collects many '+1' notes"]
    Worker -->|"④ update COUNT in bulk"| Bulk[("🍃 MongoDB · posts<br/>1000 likes → 1 write<br/>(one shared row)")]

    classDef hot fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;
    classDef tool fill:#dcfce7,stroke:#16a34a,color:#14532d;
    classDef now fill:#dbeafe,stroke:#2563eb,color:#1e3a5f;
    class Reply hot;
    class Save,Note,Worker,Bulk tool;
    class U now;
```

**Explain:** *"Two different things are stored. First, the like record — 'user A liked post X' — saved
to MongoDB immediately. That's cheap because every like is a brand-new row, so two people liking the
same post never conflict. Second, the like COUNT — the number shown on the post. That's the expensive
one, because every like on the same post updates the same single field. So instead of updating it on
every tap, the API drops a note in RabbitMQ and replies right away. A background worker collects those
notes and updates the count in bulk — a viral post becomes one database write instead of thousands.
The user only waits for step ①; the count already moved on screen optimistically."*

---

## 5. Reading Comments — same cache trick as the feed

```mermaid
flowchart LR
    U["🖥️ Browser<br/>'show comments'"] --> API["⚙️ API"]
    API --> Q{"In Redis<br/>cache?"}
    Q -->|"✅ yes"| Hit["return cached<br/>⚡ instant"]
    Q -->|"❌ no"| DB[("🍃 MongoDB<br/>fetch comments")]
    DB --> Save["save copy in Redis"]
    Save --> Out["return comments"]
    Hit --> U
    Out --> U

    classDef fast fill:#dcfce7,stroke:#16a34a,color:#14532d;
    classDef slow fill:#fef9c3,stroke:#ca8a04,color:#713f12;
    class Hit fast;
    class DB,Save slow;
```

**Explain:** *"Comments use the exact same pattern as the feed — check Redis first, fall back to
MongoDB, and cache the result. The cache is tracked per-post, so a new comment on one post never
clears another post's cache."*

---

## 6. When a Helper Goes Down — nothing crashes

```mermaid
flowchart LR
    Redis["⚡ Redis down?"] --> R2["→ just read from MongoDB<br/>(slower, still works)"]
    Rabbit["🐰 RabbitMQ down?"] --> Q2["→ update count directly<br/>(no batching, still works)"]
    Mongo["🍃 MongoDB hiccup?"] --> M2["→ auto-retry & reconnect"]

    classDef safe fill:#dcfce7,stroke:#16a34a,color:#14532d;
    class R2,Q2,M2 safe;
```

**Explain:** *"Every helper can fail without taking the app down. No Redis? Read from the database,
just slower. No RabbitMQ? Update counts directly. Database blip? Auto-reconnect. The app degrades
gracefully instead of crashing."*

---

### Regenerate the PNGs after editing
```
npx @mermaid-js/mermaid-cli -i ARCHITECTURE_DIAGRAMS.md -o architecture-diagrams/diagram.png -t default -b white
```
