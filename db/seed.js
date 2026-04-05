// Run once: node db/seed.js
require('dotenv').config();
const db = require('./database');

async function seed() {
  const count = await db.count('drivers');
  if (count > 0) {
    console.log('Already seeded. Drop and recreate tables to reset.');
    process.exit(0);
  }

  const drivers = [
    { number: 1,  name: 'Max Verstappen',    short_name: 'Verstappen', team: 'Red Bull Racing', team_color: '#3671C6', championship_pts: 0 },
    { number: 4,  name: 'Lando Norris',      short_name: 'Norris',     team: 'McLaren',         team_color: '#FF8000', championship_pts: 0 },
    { number: 16, name: 'Charles Leclerc',   short_name: 'Leclerc',    team: 'Ferrari',         team_color: '#E8002D', championship_pts: 0 },
    { number: 81, name: 'Oscar Piastri',     short_name: 'Piastri',    team: 'McLaren',         team_color: '#FF8000', championship_pts: 0 },
    { number: 63, name: 'George Russell',    short_name: 'Russell',    team: 'Mercedes',        team_color: '#27F4D2', championship_pts: 0 },
    { number: 44, name: 'Lewis Hamilton',    short_name: 'Hamilton',   team: 'Ferrari',         team_color: '#E8002D', championship_pts: 0 },
    { number: 14, name: 'Fernando Alonso',   short_name: 'Alonso',     team: 'Aston Martin',    team_color: '#358C75', championship_pts: 0 },
    { number: 55, name: 'Carlos Sainz',      short_name: 'Sainz',      team: 'Williams',        team_color: '#37BEDD', championship_pts: 0 },
    { number: 12, name: 'Kimi Antonelli',    short_name: 'Antonelli',  team: 'Mercedes',        team_color: '#27F4D2', championship_pts: 0 },
    { number: 30, name: 'Liam Lawson',       short_name: 'Lawson',     team: 'Red Bull Racing', team_color: '#3671C6', championship_pts: 0 },
    { number: 18, name: 'Lance Stroll',      short_name: 'Stroll',     team: 'Aston Martin',    team_color: '#358C75', championship_pts: 0 },
    { number: 23, name: 'Alexander Albon',   short_name: 'Albon',      team: 'Williams',        team_color: '#37BEDD', championship_pts: 0 },
    { number: 10, name: 'Pierre Gasly',      short_name: 'Gasly',      team: 'Alpine',          team_color: '#0093CC', championship_pts: 0 },
    { number: 87, name: 'Oliver Bearman',    short_name: 'Bearman',    team: 'Haas',            team_color: '#B6BABD', championship_pts: 0 },
    { number: 22, name: 'Yuki Tsunoda',      short_name: 'Tsunoda',    team: 'RB Honda',        team_color: '#6692FF', championship_pts: 0 },
    { number: 6,  name: 'Isack Hadjar',      short_name: 'Hadjar',     team: 'RB Honda',        team_color: '#6692FF', championship_pts: 0 },
    { number: 27, name: 'Nico Hülkenberg',   short_name: 'Hülkenberg', team: 'Sauber',          team_color: '#52E252', championship_pts: 0 },
    { number: 5,  name: 'Gabriel Bortoleto', short_name: 'Bortoleto',  team: 'Sauber',          team_color: '#52E252', championship_pts: 0 },
    { number: 31, name: 'Esteban Ocon',      short_name: 'Ocon',       team: 'Haas',            team_color: '#B6BABD', championship_pts: 0 },
    { number: 7,  name: 'Jack Doohan',       short_name: 'Doohan',     team: 'Alpine',          team_color: '#0093CC', championship_pts: 0 },
  ];

  const races = [
    { round:1,  name:'Australian GP',  circuit:'Melbourne',   date:'2026-03-08', is_completed:false, has_sprint:false, cancelled:false },
    { round:2,  name:'Chinese GP',     circuit:'Shanghai',    date:'2026-03-15', is_completed:false, has_sprint:true,  cancelled:false },
    { round:3,  name:'Japanese GP',    circuit:'Suzuka',      date:'2026-03-29', is_completed:false, has_sprint:false, cancelled:false },
    { round:4,  name:'Miami GP',       circuit:'Miami',       date:'2026-05-03', is_completed:false, has_sprint:true,  cancelled:false },
    { round:5,  name:'Canadian GP',    circuit:'Montreal',    date:'2026-05-24', is_completed:false, has_sprint:false, cancelled:false },
    { round:6,  name:'Monaco GP',      circuit:'Monaco',      date:'2026-06-07', is_completed:false, has_sprint:false, cancelled:false },
    { round:7,  name:'Spanish GP',     circuit:'Barcelona',   date:'2026-06-14', is_completed:false, has_sprint:false, cancelled:false },
    { round:8,  name:'Austrian GP',    circuit:'Spielberg',   date:'2026-06-28', is_completed:false, has_sprint:false, cancelled:false },
    { round:9,  name:'British GP',     circuit:'Silverstone', date:'2026-07-05', is_completed:false, has_sprint:false, cancelled:false },
    { round:10, name:'Belgian GP',     circuit:'Spa',         date:'2026-07-19', is_completed:false, has_sprint:true,  cancelled:false },
    { round:11, name:'Hungarian GP',   circuit:'Budapest',    date:'2026-07-26', is_completed:false, has_sprint:false, cancelled:false },
    { round:12, name:'Dutch GP',       circuit:'Zandvoort',   date:'2026-08-23', is_completed:false, has_sprint:false, cancelled:false },
    { round:13, name:'Italian GP',     circuit:'Monza',       date:'2026-09-06', is_completed:false, has_sprint:false, cancelled:false },
    { round:14, name:'Madrid GP',      circuit:'Madrid',      date:'2026-09-13', is_completed:false, has_sprint:false, cancelled:false },
    { round:15, name:'Azerbaijan GP',  circuit:'Baku',        date:'2026-09-26', is_completed:false, has_sprint:false, cancelled:false },
    { round:16, name:'Singapore GP',   circuit:'Singapore',   date:'2026-10-11', is_completed:false, has_sprint:false, cancelled:false },
    { round:17, name:'US GP',          circuit:'Austin',      date:'2026-10-25', is_completed:false, has_sprint:true,  cancelled:false },
    { round:18, name:'Mexico City GP', circuit:'Mexico City', date:'2026-11-01', is_completed:false, has_sprint:false, cancelled:false },
    { round:19, name:'São Paulo GP',   circuit:'São Paulo',   date:'2026-11-08', is_completed:false, has_sprint:false, cancelled:false },
    { round:20, name:'Las Vegas GP',   circuit:'Las Vegas',   date:'2026-11-21', is_completed:false, has_sprint:false, cancelled:false },
    { round:21, name:'Qatar GP',       circuit:'Lusail',      date:'2026-11-29', is_completed:false, has_sprint:true,  cancelled:false },
    { round:22, name:'Abu Dhabi GP',   circuit:'Yas Marina',  date:'2026-12-06', is_completed:false, has_sprint:false, cancelled:false },
  ];

  for (const d of drivers) await db.insert('drivers', d);
  for (const r of races)   await db.insert('races', r);

  console.log(`✓ Seeded ${drivers.length} drivers and ${races.length} races`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
