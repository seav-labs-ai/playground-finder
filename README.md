# PlaygroundFinder 🛝

A mobile-first, map-centric web app for finding playgrounds and parks near you. Built with OpenStreetMap data — free, keyless, and works everywhere.

## Features

- 🗺️ Full-screen interactive map with custom playground markers
- 📍 Geolocation — "Near Me" button centers on current position  
- 🔍 Search by neighborhood, address, or city
- 🛝 Filter by equipment (swings, slides, climbing, sandbox, seesaw...)
- 👶 Filter by age group (toddler, kids, older kids)
- 🌿 Filter by surface type (grass, rubber, woodchips, sand)
- ♿ Accessibility filter
- 📱 Mobile-first design with bottom sheet navigation
- 🧭 Directions to any playground (Apple Maps / Google Maps)
- 📤 Share playground links
- 🌍 Works globally — powered by OpenStreetMap

## Tech Stack

- **Map**: Leaflet.js + CartoDB Voyager tiles + Leaflet MarkerCluster
- **Data**: OpenStreetMap via Overpass API (free, no API key needed)
- **Geocoding**: Nominatim (free)
- **Styling**: Vanilla CSS with Inter font
- **Build**: No build step — vanilla ES modules

## Running Locally

```bash
npm run dev
# or
npx serve . -p 3456
```

Then open http://localhost:3456

## Deploying to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

The app is entirely static — no server needed.

## Data Sources

- Playground locations: `leisure=playground` from OpenStreetMap
- Equipment: `playground=*` tags (swing, slide, climbingframe, etc.)
- Geocoding: Nominatim OSM geocoding API
- All data is free and open under ODbL license

## Coverage

| Area | Quality |
|------|---------|
| Washington DC | ⭐⭐⭐⭐⭐ Excellent |
| DC Suburbs (VA/MD) | ⭐⭐⭐⭐ Very Good |
| Major US Cities | ⭐⭐⭐⭐ Good |
| European Cities | ⭐⭐⭐⭐⭐ Excellent |
| Other Areas | ⭐⭐⭐ Varies |
