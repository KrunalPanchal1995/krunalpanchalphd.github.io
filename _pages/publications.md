---
layout: page
permalink: /publications/
title: Publications
description: Journal articles, conference papers and work in preparation, most recent first.
nav: true
nav_order: 4
---

<!-- _pages/publications.md : cards come from _layouts/bib.liquid, filters from assets/js/site/components.js -->

{% capture pub_count %}{% bibliography_count %}{% endcapture %}
{% assign pub_count = pub_count | strip | plus: 0 %}

{% if pub_count > 0 %}

<div class="pub-toolbar" data-pub-toolbar>
  <div class="pub-search">
    {% include bib_search.liquid %}
  </div>
  <div class="pub-filters" data-pub-filters aria-label="Filter publications"></div>
  <p class="pub-count mono" data-pub-count aria-live="polite"></p>
</div>

<div class="publications" data-pub-list>

{% bibliography %}

</div>

<div class="pub-empty raised" data-pub-nomatch hidden>
  <p class="eyebrow">No matches</p>
  <p>Nothing matches the current search and filters.</p>
  <button type="button" class="btn-cta" data-pub-reset>Clear filters</button>
</div>

{% else %}

<div class="pub-empty raised">
  <p class="eyebrow">Publications</p>
  <p class="pub-empty-title">No entries yet</p>
  <p>Add entries to <code>_bibliography/papers.bib</code> and they appear here as cards.</p>
</div>

{% endif %}

<script defer src="{{ '/assets/js/site/components.js' | relative_url }}"></script>
