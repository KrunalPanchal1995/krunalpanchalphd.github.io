---
layout: default
title: Research Projects
permalink: /projects/
description: Research projects in combustion, optimization, uncertainty quantification, scientific ML and CFD, plus learning pages on photonics and electronics.
nav: true
nav_order: 3
---

{::nomarkdown}
{% assign sorted = site.projects | sort: 'importance' -%}
{%- assign tot_img = 0 -%}
{%- assign tot_vid = 0 -%}
{%- for p in sorted -%}
{%- assign its = site.data.project_images[p.slug] -%}
{%- assign nv = its | where_exp: 'i', 'i.video' | size -%}
{%- assign ni = its.size | minus: nv -%}
{%- assign tot_img = tot_img | plus: ni -%}
{%- assign tot_vid = tot_vid | plus: nv -%}
{%- endfor -%}
{%- assign all_cats = 'combustion,optimization,uq,sciml,cfd,experimental,software,quantum-chemistry,visualization,education,photonics,electronics,apps' | split: ',' -%}

<section class="pi" data-pi data-view="lab">
  <header class="pi-head">
    <p class="eyebrow">Work</p>
    <h1 class="pi-title" data-fx="split">Research <span class="accent-serif">projects</span></h1>
    <p class="pi-count mono">{{ sorted.size }} projects · {{ tot_img }} images · {{ tot_vid }} videos</p>
  </header>

  {% include projects-recent.liquid %}

  <div class="pi-bar">
    <div class="pi-seg" role="group" aria-label="Choose a view">
      <button type="button" class="pi-seg__b" data-set-view="lab" aria-pressed="true"><i class="fa-solid fa-table-cells" aria-hidden="true"></i><span>Lab</span></button>
      <button type="button" class="pi-seg__b" data-set-view="cinema" aria-pressed="false"><i class="fa-solid fa-film" aria-hidden="true"></i><span>Cinema</span></button>
      <button type="button" class="pi-seg__b" data-set-view="rows" aria-pressed="false"><i class="fa-solid fa-bars-staggered" aria-hidden="true"></i><span>Rows</span></button>
      <button type="button" class="pi-seg__b" data-set-view="index" aria-pressed="false"><i class="fa-solid fa-list" aria-hidden="true"></i><span>Index</span></button>
    </div>
    <label class="pi-search">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <span class="sr-only">Search projects</span>
      <input type="search" data-search placeholder="Search title, topic or text" autocomplete="off" spellcheck="false">
    </label>
  </div>
  <div class="pi-filters" role="group" aria-label="Filter by category">
    <button type="button" class="pi-f" data-filter="all" aria-pressed="true">All <span class="pi-f__n">{{ sorted.size }}</span></button>
    {%- for cat in all_cats -%}
      {%- assign cm = sorted | where_exp: 'p', 'p.category contains cat' -%}
      {%- if cm.size > 0 -%}
      <button type="button" class="pi-f" data-filter="{{ cat }}" aria-pressed="false" style="--c: var(--cat-{{ cat }}, var(--teal));">{{ cat | replace: '-', ' ' }} <span class="pi-f__n">{{ cm.size }}</span></button>
      {%- endif -%}
    {%- endfor -%}
  </div>
  <p class="pi-status mono" data-status aria-live="polite">{{ sorted.size }} of {{ sorted.size }} projects</p>

  <div class="pi-pane pi-cards" data-pane="cards">
    <div class="pc-grid" data-fx-stagger="70">
      {%- for p in sorted -%}
        {%- assign first_screen = false -%}
        {%- if forloop.index <= 6 -%}{%- assign first_screen = true -%}{%- endif -%}
        {% include project-card.liquid project=p variant="view" show_actions=true reveal=first_screen %}
      {%- endfor -%}
    </div>
  </div>

  <div class="pi-pane pi-index" data-pane="index">
    <div class="ix">
      <ul class="ix-list">
        {%- for p in sorted -%}
          {%- assign its = site.data.project_images[p.slug] -%}
          {%- assign vids = its | where_exp: 'i', 'i.video' -%}
          {%- assign ni = its.size | minus: vids.size -%}
          <li class="ix-item" data-ix data-title="{{ p.title | escape }}" data-cats="{{ p.category | join: ' ' }}" style="--c: var(--cat-{{ p.category | first }}, var(--teal));">
            <button type="button" class="ix-row" aria-expanded="false" aria-controls="ix-d-{{ p.slug }}">
              <span class="ix-n mono">{{ forloop.index | prepend: '00' | slice: -2, 2 }}</span>
              <span class="ix-t">{{ p.title }}</span>
              <span class="ix-chips">{%- for cat in p.category -%}<span class="ix-chip" style="--c: var(--cat-{{ cat }}, var(--teal));">{{ cat | replace: '-', ' ' }}</span>{%- endfor -%}</span>
              <span class="ix-c mono">{%- if its.size > 0 -%}{{ ni }} img{% if vids.size > 0 %} · {{ vids.size }} vid{% endif %}{%- else -%}text{%- endif -%}</span>
            </button>
            <div class="ix-detail" id="ix-d-{{ p.slug }}">
              {% include project-card.liquid project=p variant="pane" show_actions=true %}
            </div>
          </li>
        {%- endfor -%}
      </ul>
      <aside class="ix-pane" data-ix-pane aria-live="polite" aria-label="Project detail"></aside>
    </div>
  </div>

  <p class="pi-empty" data-empty hidden>No projects match. Clear the search or pick another category.</p>
</section>
<script defer src="{{ '/assets/js/site/projects-index.js' | relative_url }}?v={{ site.time | date: '%s' }}"></script>
{:/nomarkdown}
