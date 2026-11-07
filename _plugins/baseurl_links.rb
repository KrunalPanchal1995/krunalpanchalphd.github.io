# frozen_string_literal: true

# This site is served from a sub-path (https://<user>.github.io/<repo>/), but much of the page
# content (Markdown links in data files, hand-written HTML) uses root-relative links such as
# /projects/mosiac/. After each page is rendered, prefix those with site.baseurl, unless they
# already carry it. Does nothing when baseurl is empty (e.g. a user site, or a custom domain).
module BaseurlLinks
  ATTRS = /(\b(?:href|src|poster|action|data-src|data-href|data-module-base|data-url)=")(\/(?!\/)[^"]*)/.freeze

  def self.rewrite(html, baseurl)
    return html if baseurl.nil? || baseurl.empty?

    prefix = baseurl.start_with?('/') ? baseurl : "/#{baseurl}"
    html.gsub(ATTRS) do
      attr = Regexp.last_match(1)
      path = Regexp.last_match(2)
      already = path == prefix || path.start_with?("#{prefix}/")
      already ? "#{attr}#{path}" : "#{attr}#{prefix}#{path}"
    end
  end
end

Jekyll::Hooks.register %i[pages documents], :post_render do |doc|
  next unless doc.output_ext == '.html'

  doc.output = BaseurlLinks.rewrite(doc.output, doc.site.config['baseurl'])
end

# Static HTML files (copied as-is, never rendered) get the same treatment after the site is written.
Jekyll::Hooks.register :site, :post_write do |site|
  baseurl = site.config['baseurl']
  next if baseurl.nil? || baseurl.empty?

  site.static_files.each do |file|
    next unless file.extname == '.html'

    dest = file.destination(site.dest)
    next unless File.file?(dest)

    html = File.read(dest)
    out = BaseurlLinks.rewrite(html, baseurl)
    File.write(dest, out) unless out == html
  end
end
