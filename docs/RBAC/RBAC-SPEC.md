# 🔐 RBAC SYSTEM — SPECIFICHE TECNICHE  
Sistema ruoli fissi + ruoli custom operativi per SaaS multi-tenant

---

# 🎯 Obiettivo del Sistema

Implementare un sistema RBAC completo per un SaaS multi-tenant che supporti:

- Ruoli di piattaforma non modificabili.
- Ruoli di sistema per ogni organization, clonati automaticamente.
- Ruoli custom operativi, creati dagli amministratori dell’organization.
- Permissions atomiche e granulari.
- Override permessi per singolo utente.
- Funzione centralizzata `can()` per autorizzazioni.

Compatibile con:

- Next.js (App Router)
- TypeScript
- Prisma ORM
- PostgreSQL
- Architettura modulare (Module & Hook System)

---

# 1️⃣ Concetti Fondamentali

## 1.1 Multi-tenant

- Ogni **organization** rappresenta un'azienda isolata.
- Un utente può appartenere a più organization tramite **organization_memberships**.
- Ogni membership ha un ruolo assegnato.

## 1.2 Due livelli di ruoli

### 🔹 Livello Piattaforma (Globale)

Ruoli validi sull’intera piattaforma.  
Attualmente solo:

- **PlatformSuperAdmin**

Non dipende da organization.

### 🔹 Livello Organizzazione

Ogni organization dispone di:

- Ruoli di sistema → **fissi e non modificabili**
- Ruoli custom → creati dagli utenti dell’organizzazione

---

# 2️⃣ Ruoli di Sistema (Non Modificabili)

I ruoli di sistema hanno:

is_system = true
is_editable = false
system_key != null
organization_id = ID org (clonati) oppure null (super admin)

yaml
Copia codice

Sono clonati automaticamente per ogni nuova organization.

---

## 2.1 PLATFORM_SUPER_ADMIN

**Livello:** piattaforma  
**Unico ruolo globale**

### Capacità
- Accesso totale all’intera piattaforma.
- Gestione di tutte le organization.
- Gestione utenti globali.
- Impersonamento (opzionale).
- Bypass completo dei permessi.

### Regole
- `can()` ritorna sempre `true`.

---

## 2.2 ORG_OWNER

**Livello:** organization  
**Unico proprietario dell'azienda.**

### Capacità
- Gestione completa dell’organizzazione.
- Gestione billing e piano.
- Gestione utenti (inviti, rimozioni, ruoli).
- Creazione/modifica/eliminazione ruoli custom.
- Impostazioni globali del tenant.

### Regole
- Deve esistere almeno un Owner attivo.
- L’unico Owner non può essere declassato o rimosso.

---

## 2.3 ORG_ADMIN

### Capacità
- Gestione utenti (eccetto Owner).
- Gestione ruoli custom.
- Gestione pipeline CRM, reparti, impostazioni moduli.
- Accesso completo ai dati dell’organization.

### Limitazioni
- Non può modificare o rimuovere Owner.
- Non gestisce la fatturazione della piattaforma.

---

## 2.4 ORG_MANAGER

### Capacità
- Gestione del proprio team.
- Accesso a deals/jobs associati al team.
- Reporting di team.
- Aggiornamento operatività.

### Limitazioni
- Nessuna gestione ruoli o utenti.

---

## 2.5 ORG_MEMBER

### Capacità
- Gestione dei propri deal/jobs/task.
- Visibilità limitata ai clienti collegati ai propri lavori.

### Limitazioni
- Nessuna gestione utenti, ruoli o team.

---

## 2.6 ORG_EXTERNAL_TECH

### Capacità
- Accesso limitato ai job assegnati.
- Upload foto, note, checklist.
- Accesso minimo alle informazioni cliente.

### Limitazioni
- Nessun accesso CRM.
- Nessun accesso utenti/ruoli.

---

## 2.7 ORG_READ_ONLY

### Capacità
- Accesso consultivo.
- Può vedere documenti, stato lavori, preventivi.

### Limitazioni
- Nessuna modifica.

---

# 3️⃣ Ruoli Custom Operativi

Creati da:

- ORG_OWNER
- ORG_ADMIN

### Caratteristiche

is_system = false
is_editable = true
system_key = null

markdown
Copia codice

- Possono essere rinominati.
- Possono avere permessi personalizzati.
- Possono essere eliminati (se non assegnati a utenti).

### Esempi di ruoli custom
- Responsabile Commerciale
- Capo Cantiere
- Tecnico Senior
- Customer Care
- Responsabile Assistenza

---

# 4️⃣ Permissions (Capacità)

Le permissions sono **globali**, atomiche e non collegate a ruoli di default.  
Servono per controllare qualsiasi azione rilevante.

## 4.1 Gruppi di permessi comuni

### Utenti / Organizzazione
users.read
users.invite
users.remove
users.update_role

shell
Copia codice

### Ruoli
roles.read
roles.create_custom
roles.update_custom
roles.delete_custom

shell
Copia codice

### CRM / Deals
deals.read_own
deals.read_team
deals.read_all
deals.create
deals.update_own
deals.update_all

shell
Copia codice

### Jobs / Tecnici
jobs.read_assigned
jobs.read_team
jobs.read_all
jobs.update_assigned

shell
Copia codice

### Billing
billing.read
billing.manage_organization

shell
Copia codice

### Impostazioni
organization.update_settings
modules.manage_activation

yaml
Copia codice

---

# 5️⃣ Struttura Dati (Schema Entità)

## 5.1 users

| Campo | Tipo |
|-------|------|
| id | UUID |
| email | unique |
| password_hash | string |
| name | string |
| surname | string |
| phone | string |
| is_platform_super_admin | boolean |
| timestamps | auto |

---

## 5.2 organizations

| Campo | Tipo |
|-------|------|
| id | UUID |
| name | string |
| vat_number | string |
| address | string |
| city | string |
| country | string |
| settings | JSONB |
| timestamps | auto |

---

## 5.3 roles

| Campo | Tipo |
|-------|------|
| id | UUID |
| organization_id | UUID \| null |
| name | string |
| slug | string |
| description | string |
| is_system | boolean |
| system_key | enum \| null |
| is_editable | boolean |
| is_default_for_new_members | boolean |
| timestamps | auto |

---

## 5.4 permissions

| Campo | Tipo |
|-------|------|
| id | UUID |
| key | string |
| group | string |
| description | string |
| timestamps | auto |

---

## 5.5 role_permissions

| Campo | Tipo |
|-------|------|
| role_id | UUID |
| permission_id | UUID |

---

## 5.6 organization_memberships

| Campo | Tipo |
|-------|------|
| id | UUID |
| user_id | UUID |
| organization_id | UUID |
| role_id | UUID |
| status | enum(pending, active, disabled) |
| invited_by_user_id | UUID |
| timestamps | auto |

---

## 5.7 membership_permission_overrides

| Campo | Tipo |
|-------|------|
| id | UUID |
| membership_id | UUID |
| permission_id | UUID |
| mode | enum(grant, revoke) |

---

# 6️⃣ Regole di Business

## 6.1 Platform Super Admin
- Override totale su ogni permesso.
- Nessuna membership necessaria.

## 6.2 Ruoli di sistema
- Clonati per ogni organization.
- Non modificabili.
- Non eliminabili.
- Lista permessi bloccata.

## 6.3 Ruoli custom
- Completamente editabili.
- Eliminabili se non assegnati a utenti.
- Creati da Owner/Admin.

## 6.4 Membership
- Un utente può appartenere a infinite organization.
- Ogni membership → 1 ruolo principale.
- Override permessi opzionali.

## 6.5 Funzione `can()`

Flow logico:

Se user.is_platform_super_admin → return true

Recupera membership per (user, organization)

Recupera permessi del ruolo associato

Applica override:

grant → aggiungi permesso

revoke → rimuovi permesso

return (permissionKey ∈ permissions)

yaml
Copia codice

---

# 7️⃣ Workflow Operativi

## 7.1 Creazione Organizzazione (Signup)
- Crea utente (se nuovo).
- Crea organization.
- Clona ruoli di sistema ORG_*.
- Crea membership owner.
- Imposta sessione.

## 7.2 Invito Utente
- Owner/Admin invia invito.
- Crea membership con status `pending`.
- Alla conferma → status `active`.

## 7.3 Creazione Ruolo Custom
- Owner/Admin può creare ruolo operativo.
- Imposta nome, slug e permessi.
- Ruolo disponibile per assegnazione.

## 7.4 Modifica Ruolo Utente
- Aggiorna membership role_id.
- Protezione: non si può togliere l’ultimo Owner.

## 7.5 Override Permessi
- Aggiunta di privilegi extra (grant).
- Rimozione di specifici permessi (revoke).
- Si applica a livello di membership singola.

---

# ✅ Conclusione

Questo documento è la **fonte ufficiale** per l’implementazione RBAC del gestionale:

- chiaro,
- modulare,
- compatibile con Antigravity,
- pronto per generare schema Prisma, API, seed e funzioni `can()`.
