(function(){
  function buildShareUrl(postId, options){
    var base = (location.origin || '') + '/share/' + encodeURIComponent(postId);
    if (options && options.appId) base += ('?appId=' + encodeURIComponent(options.appId));
    return base;
  }
  function sharePost(postId, options){
    var url = buildShareUrl(postId, options||{});
    var title = (options && options.title) || 'Nuvia';
    if (navigator.share){ return navigator.share({ title: title, url: url }).catch(function(){}); }
    try { navigator.clipboard.writeText(url); alert('Link copied'); } catch(_) { window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank'); }
  }
  window.NuviaShare = { buildShareUrl: buildShareUrl, sharePost: sharePost };
})();
