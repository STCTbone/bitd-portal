-- Blades in the Dark Tracker Schema
-- HISTORICAL UPSTREAM REFERENCE ONLY: incompatible with the active portal.
-- Fresh setup uses config.toml and ordered migrations/ through backend:start.
-- Uses a dedicated 'bitd' schema to keep things separate from public.

CREATE SCHEMA IF NOT EXISTS bitd;

-- Campaigns
CREATE TABLE bitd.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Campaign membership (GM vs player)
CREATE TABLE bitd.campaign_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES bitd.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('gm', 'player')),
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);

-- Crews
CREATE TABLE bitd.crews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES bitd.campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  crew_type TEXT CHECK (crew_type IN ('assassins', 'bravos', 'cult', 'hawkers', 'shadows', 'smugglers')),
  reputation TEXT,
  lair_location TEXT,
  hunting_grounds_type TEXT,
  hunting_grounds_location TEXT,
  tier INTEGER NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 5),
  hold TEXT NOT NULL DEFAULT 'strong' CHECK (hold IN ('strong', 'weak')),
  rep INTEGER NOT NULL DEFAULT 0 CHECK (rep BETWEEN 0 AND 12),
  heat INTEGER NOT NULL DEFAULT 0 CHECK (heat BETWEEN 0 AND 9),
  wanted_level INTEGER NOT NULL DEFAULT 0 CHECK (wanted_level BETWEEN 0 AND 4),
  coin INTEGER NOT NULL DEFAULT 2 CHECK (coin >= 0),
  vault_capacity INTEGER NOT NULL DEFAULT 4,
  crew_xp INTEGER NOT NULL DEFAULT 0 CHECK (crew_xp BETWEEN 0 AND 11),
  special_abilities TEXT[] DEFAULT '{}',
  upgrades TEXT[] DEFAULT '{}',
  claims_seized TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Characters
CREATE TABLE bitd.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID REFERENCES bitd.crews(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id),
  campaign_id UUID NOT NULL REFERENCES bitd.campaigns(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,
  alias TEXT,
  look TEXT,
  playbook TEXT CHECK (playbook IN ('cutter', 'hound', 'leech', 'lurk', 'slide', 'spider', 'whisper')),
  heritage TEXT,
  heritage_detail TEXT,
  background TEXT,
  background_detail TEXT,

  -- Vice
  vice TEXT,
  vice_purveyor TEXT,

  -- Volatile state (changes constantly during play)
  stress INTEGER NOT NULL DEFAULT 0 CHECK (stress BETWEEN 0 AND 9),
  trauma TEXT[] DEFAULT '{}',
  coin INTEGER NOT NULL DEFAULT 0 CHECK (coin >= 0),
  stash INTEGER NOT NULL DEFAULT 0 CHECK (stash BETWEEN 0 AND 40),

  -- XP tracks
  playbook_xp INTEGER NOT NULL DEFAULT 0 CHECK (playbook_xp BETWEEN 0 AND 7),
  insight_xp INTEGER NOT NULL DEFAULT 0 CHECK (insight_xp BETWEEN 0 AND 5),
  prowess_xp INTEGER NOT NULL DEFAULT 0 CHECK (prowess_xp BETWEEN 0 AND 5),
  resolve_xp INTEGER NOT NULL DEFAULT 0 CHECK (resolve_xp BETWEEN 0 AND 5),

  -- Action ratings (Insight)
  hunt INTEGER NOT NULL DEFAULT 0 CHECK (hunt BETWEEN 0 AND 4),
  study INTEGER NOT NULL DEFAULT 0 CHECK (study BETWEEN 0 AND 4),
  survey INTEGER NOT NULL DEFAULT 0 CHECK (survey BETWEEN 0 AND 4),
  tinker INTEGER NOT NULL DEFAULT 0 CHECK (tinker BETWEEN 0 AND 4),
  -- Action ratings (Prowess)
  finesse INTEGER NOT NULL DEFAULT 0 CHECK (finesse BETWEEN 0 AND 4),
  prowl INTEGER NOT NULL DEFAULT 0 CHECK (prowl BETWEEN 0 AND 4),
  skirmish INTEGER NOT NULL DEFAULT 0 CHECK (skirmish BETWEEN 0 AND 4),
  wreck INTEGER NOT NULL DEFAULT 0 CHECK (wreck BETWEEN 0 AND 4),
  -- Action ratings (Resolve)
  attune INTEGER NOT NULL DEFAULT 0 CHECK (attune BETWEEN 0 AND 4),
  command INTEGER NOT NULL DEFAULT 0 CHECK (command BETWEEN 0 AND 4),
  consort INTEGER NOT NULL DEFAULT 0 CHECK (consort BETWEEN 0 AND 4),
  sway INTEGER NOT NULL DEFAULT 0 CHECK (sway BETWEEN 0 AND 4),

  -- Harm
  harm_level3 TEXT,
  harm_level2_a TEXT,
  harm_level2_b TEXT,
  harm_level1_a TEXT,
  harm_level1_b TEXT,
  healing_clock INTEGER NOT NULL DEFAULT 0 CHECK (healing_clock BETWEEN 0 AND 4),

  -- Armor
  armor_available BOOLEAN NOT NULL DEFAULT TRUE,
  heavy_armor_available BOOLEAN NOT NULL DEFAULT FALSE,
  special_armor_available BOOLEAN NOT NULL DEFAULT TRUE,
  armor_used BOOLEAN NOT NULL DEFAULT FALSE,
  heavy_armor_used BOOLEAN NOT NULL DEFAULT FALSE,
  special_armor_used BOOLEAN NOT NULL DEFAULT FALSE,

  -- Load (active during scores)
  load_level TEXT CHECK (load_level IN ('light', 'normal', 'heavy')),
  items_carried TEXT[] DEFAULT '{}',

  -- Abilities
  special_abilities TEXT[] DEFAULT '{}',

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Clocks (universal progress tracker)
CREATE TABLE bitd.clocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES bitd.campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  segments INTEGER NOT NULL DEFAULT 4 CHECK (segments IN (4, 6, 8, 12)),
  filled INTEGER NOT NULL DEFAULT 0,
  clock_type TEXT DEFAULT 'general',
  visible_to_players BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (filled >= 0 AND filled <= segments)
);

-- Factions
CREATE TABLE bitd.factions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES bitd.campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tier INTEGER NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 5),
  hold TEXT NOT NULL DEFAULT 'strong' CHECK (hold IN ('strong', 'weak')),
  status INTEGER NOT NULL DEFAULT 0 CHECK (status BETWEEN -3 AND 3),
  category TEXT,
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE bitd.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitd.campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitd.crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitd.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitd.clocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitd.factions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: members of a campaign can read all campaign data
CREATE POLICY "Campaign members can read campaigns" ON bitd.campaigns
  FOR SELECT USING (
    id IN (SELECT campaign_id FROM bitd.campaign_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Anyone can create campaigns" ON bitd.campaigns
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Members can read membership" ON bitd.campaign_members
  FOR SELECT USING (
    campaign_id IN (SELECT campaign_id FROM bitd.campaign_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Campaign creators can add members" ON bitd.campaign_members
  FOR INSERT WITH CHECK (
    campaign_id IN (SELECT id FROM bitd.campaigns WHERE created_by = auth.uid())
    OR user_id = auth.uid()
  );

-- Crew policies
CREATE POLICY "Members can read crews" ON bitd.crews
  FOR SELECT USING (
    campaign_id IN (SELECT campaign_id FROM bitd.campaign_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Members can update crews" ON bitd.crews
  FOR UPDATE USING (
    campaign_id IN (SELECT campaign_id FROM bitd.campaign_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Members can insert crews" ON bitd.crews
  FOR INSERT WITH CHECK (
    campaign_id IN (SELECT campaign_id FROM bitd.campaign_members WHERE user_id = auth.uid())
  );

-- Character policies
CREATE POLICY "Members can read characters" ON bitd.characters
  FOR SELECT USING (
    campaign_id IN (SELECT campaign_id FROM bitd.campaign_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Owners and GMs can update characters" ON bitd.characters
  FOR UPDATE USING (
    user_id = auth.uid()
    OR campaign_id IN (
      SELECT campaign_id FROM bitd.campaign_members
      WHERE user_id = auth.uid() AND role = 'gm'
    )
  );

CREATE POLICY "Members can insert characters" ON bitd.characters
  FOR INSERT WITH CHECK (
    campaign_id IN (SELECT campaign_id FROM bitd.campaign_members WHERE user_id = auth.uid())
  );

-- Clock policies
CREATE POLICY "Members can read visible clocks" ON bitd.clocks
  FOR SELECT USING (
    campaign_id IN (SELECT campaign_id FROM bitd.campaign_members WHERE user_id = auth.uid())
    AND (
      visible_to_players = TRUE
      OR campaign_id IN (
        SELECT campaign_id FROM bitd.campaign_members
        WHERE user_id = auth.uid() AND role = 'gm'
      )
    )
  );

CREATE POLICY "GMs can manage clocks" ON bitd.clocks
  FOR ALL USING (
    campaign_id IN (
      SELECT campaign_id FROM bitd.campaign_members
      WHERE user_id = auth.uid() AND role = 'gm'
    )
  );

-- Faction policies
CREATE POLICY "Members can read factions" ON bitd.factions
  FOR SELECT USING (
    campaign_id IN (SELECT campaign_id FROM bitd.campaign_members WHERE user_id = auth.uid())
  );

CREATE POLICY "GMs can manage factions" ON bitd.factions
  FOR ALL USING (
    campaign_id IN (
      SELECT campaign_id FROM bitd.campaign_members
      WHERE user_id = auth.uid() AND role = 'gm'
    )
  );
