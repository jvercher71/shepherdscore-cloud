-- =============================================================================
-- ShepherdsCore Cloud — Test Data Seed for Grace Community Church
-- =============================================================================
-- Generates ~3 years of realistic test data:
--   - ~30 families
--   - 150 members (with status, role_tags, birthdays, join_dates, etc.)
--   - 5 groups with memberships
--   - 4 Bible study groups with rosters
--   - ~312 events (Sunday + Wednesday services for 3 years + specials)
--   - ~312 headcount attendance records
--   - ~5000 giving records spread across categories and methods
--
-- HOW TO RUN:
--   1. Open Supabase → SQL Editor.
--   2. Paste this whole file.
--   3. Run. The DO-block is idempotent-safe for its existence check, but the
--      INSERTS themselves are NOT — running it twice will duplicate data.
--
-- REQUIRES: A church with a name containing "Grace Community" must already
-- exist. Update the lookup at the top of the block if yours is named
-- differently.
-- =============================================================================

DO $seed$
DECLARE
  v_church_id uuid;
  v_today     date := current_date;
  v_start     date := current_date - interval '3 years';
  v_names_first text[] := ARRAY[
    'James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda',
    'William','Elizabeth','David','Barbara','Richard','Susan','Joseph','Jessica',
    'Thomas','Sarah','Charles','Karen','Christopher','Nancy','Daniel','Lisa',
    'Matthew','Betty','Anthony','Helen','Mark','Sandra','Donald','Donna',
    'Steven','Carol','Paul','Ruth','Andrew','Sharon','Joshua','Michelle',
    'Kenneth','Laura','Kevin','Emily','Brian','Kimberly','George','Deborah',
    'Edward','Dorothy','Ronald','Amy','Timothy','Angela','Jason','Ashley',
    'Jeffrey','Brenda','Ryan','Emma','Jacob','Olivia','Gary','Cynthia',
    'Nicholas','Marie','Eric','Janet','Jonathan','Catherine','Stephen','Frances',
    'Larry','Christine','Justin','Samantha','Scott','Debra','Brandon','Rachel',
    'Benjamin','Carolyn','Samuel','Virginia','Gregory','Martha','Frank','Hannah',
    'Alexander','Grace','Raymond','Julia','Patrick','Rose','Jack','Alice',
    'Dennis','Joan','Jerry','Megan','Tyler','Kathleen','Aaron','Pamela'
  ];
  v_last_names text[] := ARRAY[
    'Anderson','Johnson','Williams','Brown','Davis','Miller','Wilson','Moore',
    'Taylor','Thomas','Jackson','White','Harris','Martin','Garcia','Rodriguez',
    'Lewis','Lee','Walker','Hall','Allen','Young','King','Wright','Lopez',
    'Hill','Scott','Green','Adams','Baker','Nelson','Carter','Mitchell','Perez',
    'Roberts','Turner','Phillips','Campbell'
  ];
  v_streets text[] := ARRAY[
    'Maple St','Oak Ave','Pine Ln','Cedar Rd','Elm Dr','Birch Way','Willow Ct',
    'Chestnut Blvd','Magnolia Dr','Dogwood Ln','Church St','Main St',
    'Park Ave','Highland Rd','Vista Dr','Sunrise Blvd','Sunset Ln','Grove Ave'
  ];
  v_cities text[] := ARRAY['Springfield','Riverside','Greenville','Fairview','Madison'];
  v_states text[] := ARRAY['NC','SC','GA','TN','VA'];
  v_categories text[] := ARRAY['Tithe','General Offering','Missions','Building Fund','Youth Ministry','Food Pantry','Special Event'];
  v_methods text[] := ARRAY['Online/EFT','Check','Cash','Credit Card','Check','Online/EFT','Online/EFT'];
  v_roles text[] := ARRAY['Bible Study Leader','Volunteer','Staff','Deacon','Elder','Worship Team','Youth Leader','Small Group Leader','Greeter','Usher'];

  v_family_rec record;
  v_member_rec record;
  v_event_rec record;
  v_family_ids uuid[];
  v_member_ids uuid[];
  v_group_ids  uuid[];
  v_bible_ids  uuid[];
  v_event_ids  uuid[];

  v_i int;
  v_j int;
  v_date date;
  v_rand float;
BEGIN
  -- 1. Locate the church ---------------------------------------------------
  SELECT id INTO v_church_id
  FROM public.churches
  WHERE name ILIKE '%Grace Community%'
  LIMIT 1;

  IF v_church_id IS NULL THEN
    RAISE EXCEPTION 'No church found matching "Grace Community". Check Settings → Church Name.';
  END IF;

  RAISE NOTICE 'Seeding church_id=%', v_church_id;

  -- 2. Families ------------------------------------------------------------
  FOR v_i IN 1..30 LOOP
    INSERT INTO public.families (church_id, family_name, phone, email, address, notes)
    VALUES (
      v_church_id,
      v_last_names[((v_i - 1) % array_length(v_last_names, 1)) + 1] || ' Family',
      '(555) ' || lpad((100 + v_i)::text, 3, '0') || '-' || lpad((1000 + v_i)::text, 4, '0'),
      lower(v_last_names[((v_i - 1) % array_length(v_last_names, 1)) + 1]) || v_i || '@example.com',
      (100 + v_i * 7)::text || ' ' || v_streets[((v_i - 1) % array_length(v_streets, 1)) + 1]
        || ', ' || v_cities[((v_i - 1) % array_length(v_cities, 1)) + 1]
        || ' ' || v_states[((v_i - 1) % array_length(v_states, 1)) + 1],
      CASE WHEN v_i % 7 = 0 THEN 'Long-time members since founding.' ELSE '' END
    );
  END LOOP;

  SELECT array_agg(id) INTO v_family_ids
  FROM (SELECT id FROM public.families WHERE church_id = v_church_id ORDER BY created_at DESC LIMIT 30) f;

  -- 3. Members (150) -------------------------------------------------------
  FOR v_i IN 1..150 LOOP
    INSERT INTO public.members (
      church_id, first_name, last_name, preferred_name,
      email, phone, cell_phone, address, city, state, zip,
      birthday, join_date, joined_by, status, notes,
      family_id, role_tags
    )
    VALUES (
      v_church_id,
      v_names_first[((v_i - 1) % array_length(v_names_first, 1)) + 1],
      v_last_names[((v_i - 1) % array_length(v_last_names, 1)) + 1],
      CASE WHEN v_i % 6 = 0 THEN v_names_first[((v_i * 3) % array_length(v_names_first, 1)) + 1] ELSE '' END,
      lower(v_names_first[((v_i - 1) % array_length(v_names_first, 1)) + 1])
        || '.' || lower(v_last_names[((v_i - 1) % array_length(v_last_names, 1)) + 1])
        || v_i || '@example.com',
      '(555) ' || lpad((200 + v_i)::text, 3, '0') || '-' || lpad((2000 + v_i)::text, 4, '0'),
      '(555) ' || lpad((300 + v_i)::text, 3, '0') || '-' || lpad((3000 + v_i)::text, 4, '0'),
      (200 + v_i * 3)::text || ' ' || v_streets[((v_i - 1) % array_length(v_streets, 1)) + 1],
      v_cities[((v_i - 1) % array_length(v_cities, 1)) + 1],
      v_states[((v_i - 1) % array_length(v_states, 1)) + 1],
      lpad(((28000 + v_i * 13) % 99999)::text, 5, '0'),
      -- birthday: spread across ages 8 to 85
      (date '1940-01-01' + ((random() * 27000)::int || ' days')::interval)::date,
      -- join_date: spread across last ~5 years, with more recent bias
      (v_today - ((random() * 1800)::int || ' days')::interval)::date,
      (ARRAY['Baptism','Transfer','Profession of Faith','Restoration','Other'])[(v_i % 5) + 1],
      -- status: 78% Active, 10% Visitor, 7% Inactive, 3% Transferred, 2% Deceased
      CASE
        WHEN v_i <= 117 THEN 'Active'
        WHEN v_i <= 132 THEN 'Visitor'
        WHEN v_i <= 143 THEN 'Inactive'
        WHEN v_i <= 147 THEN 'Transferred'
        ELSE 'Deceased'
      END,
      CASE WHEN v_i % 9 = 0 THEN 'Prefers phone over email.'
           WHEN v_i % 9 = 3 THEN 'Celiac — provide GF options at potlucks.'
           WHEN v_i % 9 = 5 THEN 'Small group leader since 2021.'
           ELSE '' END,
      -- 85% have a family, 15% unfamilied
      CASE WHEN v_i % 20 < 17 THEN v_family_ids[((v_i - 1) % 30) + 1] ELSE NULL END,
      -- Role tags: distribute across roles; most have 0-2 tags
      CASE
        WHEN v_i % 20 = 0 THEN ARRAY['Elder','Deacon']
        WHEN v_i % 19 = 0 THEN ARRAY['Staff','Worship Team']
        WHEN v_i % 13 = 0 THEN ARRAY['Bible Study Leader']
        WHEN v_i % 11 = 0 THEN ARRAY['Worship Team']
        WHEN v_i % 10 = 0 THEN ARRAY['Volunteer','Greeter']
        WHEN v_i % 9 = 0 THEN ARRAY['Usher']
        WHEN v_i % 8 = 0 THEN ARRAY['Youth Leader']
        WHEN v_i % 7 = 0 THEN ARRAY['Volunteer']
        WHEN v_i % 6 = 0 THEN ARRAY['Small Group Leader']
        WHEN v_i % 5 = 0 THEN ARRAY['Greeter']
        ELSE ARRAY[]::text[]
      END
    );
  END LOOP;

  SELECT array_agg(id) INTO v_member_ids
  FROM (SELECT id FROM public.members WHERE church_id = v_church_id ORDER BY created_at DESC LIMIT 150) m;

  -- 4. General Groups ------------------------------------------------------
  INSERT INTO public.groups (church_id, name, description, location) VALUES
    (v_church_id, 'Men''s Ministry',    'Monthly men''s breakfast and service projects.', 'Fellowship Hall'),
    (v_church_id, 'Women''s Fellowship','Weekly women''s prayer and study.',              'Room 201'),
    (v_church_id, 'Youth Group',        'Middle and high-school ministry.',               'Youth Center'),
    (v_church_id, 'Worship Team',       'Music ministry and rehearsals.',                 'Sanctuary'),
    (v_church_id, 'Prayer Warriors',    'Weekly intercessory prayer meeting.',            'Chapel');

  SELECT array_agg(id) INTO v_group_ids
  FROM (SELECT id FROM public.groups WHERE church_id = v_church_id ORDER BY created_at DESC LIMIT 5) g;

  -- Populate group memberships (random subsets)
  FOR v_i IN 1..5 LOOP
    INSERT INTO public.group_members (group_id, member_id)
    SELECT v_group_ids[v_i], id FROM public.members
    WHERE church_id = v_church_id AND status = 'Active'
    ORDER BY random() LIMIT (10 + (v_i * 4))
    ON CONFLICT (group_id, member_id) DO NOTHING;
  END LOOP;

  -- 5. Bible Study Groups --------------------------------------------------
  INSERT INTO public.bible_study_groups (church_id, name, description, meeting_day, meeting_time, location, teacher_id) VALUES
    (v_church_id, 'Foundations',        'Intro study for new believers.',       'Sunday',    '09:00', 'Room 101',            v_member_ids[1]),
    (v_church_id, 'Book of Romans',     'Verse-by-verse through Romans.',       'Tuesday',   '19:00', 'Fellowship Hall',     v_member_ids[2]),
    (v_church_id, 'Wednesday Morning',  'Women''s topical study.',              'Wednesday', '10:00', 'Room 201',            v_member_ids[3]),
    (v_church_id, 'Youth Discipleship', 'Teen-focused discipleship study.',     'Sunday',    '18:00', 'Youth Center',        v_member_ids[4]);

  SELECT array_agg(id) INTO v_bible_ids
  FROM (SELECT id FROM public.bible_study_groups WHERE church_id = v_church_id ORDER BY created_at DESC LIMIT 4) b;

  -- Populate bible study rosters
  FOR v_i IN 1..4 LOOP
    INSERT INTO public.bible_study_members (group_id, member_id)
    SELECT v_bible_ids[v_i], id FROM public.members
    WHERE church_id = v_church_id AND status = 'Active'
    ORDER BY random() LIMIT (8 + v_i * 3)
    ON CONFLICT (group_id, member_id) DO NOTHING;
  END LOOP;

  -- 6. Events + 7. Attendance ---------------------------------------------
  -- Weekly Sunday services for 3 years
  FOR v_date IN
    SELECT generate_series(
      date_trunc('week', v_start)::date,
      v_today,
      interval '1 week'
    )::date
  LOOP
    -- Sunday Service
    INSERT INTO public.events (church_id, name, date, event_time, event_type, location, description)
    VALUES (
      v_church_id,
      'Sunday Service',
      v_date,
      '10:30',
      'Sunday Service',
      'Sanctuary',
      ''
    ) RETURNING id INTO v_event_rec;

    INSERT INTO public.attendance (church_id, event_id, service_type, date, headcount, notes)
    VALUES (
      v_church_id,
      v_event_rec.id,
      'Sunday Service',
      v_date,
      -- headcount 70-140 with some seasonal bump around easter/christmas
      (80 + (random() * 40)::int
        + CASE
            WHEN extract(month from v_date) IN (12) AND extract(day from v_date) >= 20 THEN 30
            WHEN extract(month from v_date) = 3 AND extract(day from v_date) BETWEEN 20 AND 31 THEN 25
            WHEN extract(month from v_date) = 4 AND extract(day from v_date) <= 10 THEN 25
            ELSE 0 END)::int,
      ''
    );

    -- Wednesday Service (same week)
    INSERT INTO public.events (church_id, name, date, event_time, event_type, location, description)
    VALUES (
      v_church_id,
      'Wednesday Service',
      v_date + 3,
      '19:00',
      'Wednesday Service',
      'Sanctuary',
      ''
    ) RETURNING id INTO v_event_rec;

    INSERT INTO public.attendance (church_id, event_id, service_type, date, headcount, notes)
    VALUES (
      v_church_id,
      v_event_rec.id,
      'Wednesday Service',
      v_date + 3,
      (30 + (random() * 25)::int)::int,
      ''
    );
  END LOOP;

  -- Add a handful of special events per year
  FOR v_i IN 0..2 LOOP
    v_date := (v_start + (v_i || ' year')::interval)::date;
    INSERT INTO public.events (church_id, name, date, event_time, event_type, location, description) VALUES
      (v_church_id, 'Easter Service',        v_date + interval '90 days', '10:00', 'Special Event', 'Sanctuary',      'Easter Sunday celebration.'),
      (v_church_id, 'Vacation Bible School', v_date + interval '180 days','09:00', 'Youth Event',   'Youth Center',   '5-day summer VBS.'),
      (v_church_id, 'Fall Potluck',          v_date + interval '280 days','17:30', 'Special Event', 'Fellowship Hall','Annual harvest potluck.'),
      (v_church_id, 'Christmas Eve Service', v_date + interval '358 days','19:00', 'Special Event', 'Sanctuary',      'Candlelight service.');
  END LOOP;

  -- 8. Event attendance (sample members attended each recent Sunday) -------
  FOR v_event_rec IN
    SELECT id, date FROM public.events
    WHERE church_id = v_church_id
      AND event_type = 'Sunday Service'
      AND date >= v_today - interval '90 days'
  LOOP
    INSERT INTO public.event_attendance (event_id, member_id)
    SELECT v_event_rec.id, id FROM public.members
    WHERE church_id = v_church_id AND status = 'Active'
    ORDER BY random() LIMIT (60 + (random() * 40)::int)
    ON CONFLICT (event_id, member_id) DO NOTHING;
  END LOOP;

  -- 9. Giving --------------------------------------------------------------
  -- Each active member: 0-3 gifts per month for ~36 months, varied category/method.
  FOR v_member_rec IN
    SELECT id, first_name FROM public.members
    WHERE church_id = v_church_id AND status IN ('Active','Inactive','Transferred')
  LOOP
    FOR v_i IN 0..36 LOOP
      v_rand := random();
      -- 70% of months get a gift, 20% get two gifts, 10% none
      IF v_rand < 0.70 THEN
        INSERT INTO public.giving (church_id, member_id, amount, category, date, method, notes)
        VALUES (
          v_church_id, v_member_rec.id,
          round((random() * 450 + 25)::numeric, 2),
          v_categories[(1 + (random() * 6)::int)],
          (v_start + (v_i || ' months')::interval + ((random() * 27)::int || ' days')::interval)::date,
          v_methods[(1 + (random() * 6)::int)],
          ''
        );
      ELSIF v_rand < 0.90 THEN
        INSERT INTO public.giving (church_id, member_id, amount, category, date, method, notes)
        VALUES (
          v_church_id, v_member_rec.id,
          round((random() * 200 + 10)::numeric, 2),
          'Tithe',
          (v_start + (v_i || ' months')::interval + ((random() * 27)::int || ' days')::interval)::date,
          'Online/EFT', ''
        );
        INSERT INTO public.giving (church_id, member_id, amount, category, date, method, notes)
        VALUES (
          v_church_id, v_member_rec.id,
          round((random() * 150 + 10)::numeric, 2),
          v_categories[(1 + (random() * 6)::int)],
          (v_start + (v_i || ' months')::interval + ((random() * 27)::int || ' days')::interval)::date,
          v_methods[(1 + (random() * 6)::int)],
          'Split gift'
        );
      END IF;
    END LOOP;
  END LOOP;

  -- A small number of anonymous gifts (walk-in cash)
  FOR v_i IN 1..40 LOOP
    INSERT INTO public.giving (church_id, member_id, amount, category, date, method, notes)
    VALUES (
      v_church_id, NULL,
      round((random() * 100 + 5)::numeric, 2),
      (ARRAY['General Offering','Food Pantry','Special Event'])[(1 + (random() * 3)::int)],
      (v_start + ((random() * 1095)::int || ' days')::interval)::date,
      'Cash',
      'Anonymous'
    );
  END LOOP;

  -- 10. Summary -----------------------------------------------------------
  RAISE NOTICE 'Seed complete for church %', v_church_id;
  RAISE NOTICE 'Families: %',   (SELECT count(*) FROM public.families WHERE church_id = v_church_id);
  RAISE NOTICE 'Members: %',    (SELECT count(*) FROM public.members WHERE church_id = v_church_id);
  RAISE NOTICE 'Groups: %',     (SELECT count(*) FROM public.groups WHERE church_id = v_church_id);
  RAISE NOTICE 'Bible studies: %', (SELECT count(*) FROM public.bible_study_groups WHERE church_id = v_church_id);
  RAISE NOTICE 'Events: %',     (SELECT count(*) FROM public.events WHERE church_id = v_church_id);
  RAISE NOTICE 'Attendance: %', (SELECT count(*) FROM public.attendance WHERE church_id = v_church_id);
  RAISE NOTICE 'Giving rows: %',(SELECT count(*) FROM public.giving WHERE church_id = v_church_id);
END
$seed$;
