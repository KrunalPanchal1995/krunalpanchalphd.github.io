---
layout: site-page
intake: beyond-research
variant: beyond
title: Beyond Research
accent_word: Research
eyebrow: Lab and art
permalink: /beyond-research/
nav: true
nav_group: more
nav_order: 6
map: true
empty_hint: "Write anything about life outside research. Media are grouped by topic (for example chess, photography, travel, books); each topic becomes a labelled section."
---

{%- assign leaf = site.third_party_libraries.leaflet -%}

<script defer src="{{ leaf.url.js }}" integrity="{{ leaf.integrity.js }}" crossorigin="anonymous"></script>
<div class="sp-map-wrap raised" data-fx="reveal">
  <div
    id="travel-map"
    class="sp-map"
    role="region"
    aria-label="Map of places visited"
    {% if site.data.intake_pages['beyond-research'].extra.places %}data-places="{{ site.data.intake_pages['beyond-research'].extra.places | jsonify | escape }}"{% endif %}
  ></div>
  <p class="sp-map__credit mono">Map: <a href="https://leafletjs.com/" target="_blank" rel="noopener">Leaflet</a>, tiles &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</p>
</div>
{%- if site.data.intake_pages['beyond-research'].extra.places -%}
<ul class="sp-places" aria-label="Places on the map" data-places-list>
  {%- for p in site.data.intake_pages['beyond-research'].extra.places -%}
  <li><button type="button" class="chip" data-place="{{ forloop.index0 }}">{{ p[2] | escape }}</button></li>
  {%- endfor -%}
</ul>
{%- endif -%}
