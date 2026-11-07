---
layout: site-page
variant: news
title: News
eyebrow: Updates
permalink: /news/
no_empty: true
sections: false
---

{%- assign items = site.news | reverse -%}
{%- if items.size > 0 -%}

<ol class="sp-timeline sp-timeline--news">
  {%- for item in items -%}
  <li class="sp-timeline__item{% if forloop.first %} is-current{% endif %}" data-fx="reveal">
    <p class="sp-timeline__when mono"><time datetime="{{ item.date | date: '%Y-%m-%d' }}">{{ item.date | date: '%d %b %Y' }}</time></p>
    <div class="sp-timeline__text">
      {%- if item.inline -%}
        {{ item.content | remove: '<p>' | remove: '</p>' }}
      {%- else -%}
        <a class="news-title" href="{{ item.url | relative_url }}">{{ item.title }}</a>
      {%- endif -%}
    </div>
  </li>
  {%- endfor -%}
</ol>
{%- else -%}
<p class="sp-empty__p">No news so far.</p>
{%- endif -%}
