# Natural Earth geographic outlines

`earth-boundaries.json` contains Natural Earth 1:50m coastlines and land boundaries,
with attributes omitted and coordinates rounded to four decimal places.
Natural Earth data is in the public domain: https://www.naturalearthdata.com/about/terms-of-use/

Source revision: `ca96624a56bd078437bca8184e78163e5039ad19`

- https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_50m_coastline.geojson
- https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_50m_admin_0_boundary_lines_land.geojson

Rebuild with `node scripts/update-boundaries.mjs`.
These generalized lines support orientation at globe scale; they are not a detailed
survey or an authoritative statement of political boundaries.
