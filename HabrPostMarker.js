// ==UserScript==
// @name        HabrPostParser
// @namespace   Test
// @include     https://habrahabr.ru/*
// @version     1
// @grant       GM_getValue
// @grant       GM_setValue
// ==/UserScript==

function PostMarker() {
	var readedPosts = GM_getValue("readedPosts");
	this.readedPosts = readedPosts instanceof Array ? readedPosts : [];

	var importantPosts = GM_getValue("importantPosts");
	this.importantPosts = importantPosts instanceof Array ? importantPosts : [];
}

PostMarker.prototype.readPost = function(url) {
	if(!~this.readedPosts.indexOf(url)) {
        this.readedPosts.push(url);
        GM_setValue("readedPosts", this.readedPosts);
    }	
};

PostMarker.prototype.unreadPost = function(url) {
	var index = this.readedPosts.indexOf(cur);
	if(~index) {
		this.readedPosts.splice(index, 1);
		GM_setValue("readedPosts", this.readedPosts);
	}
};

PostMarker.prototype.importantPost = function(url) {
	if(!~this.importantPosts.indexOf(url)) {
		this.importantPosts.push(url);
		GM_setValue("importantPosts", this.importantPosts);
	}
};

function ContentFeatcher() {}

ContentFeatcher.getResult = function(url) {
    return new Promise((res, rej) => {
        var request = new XMLHttpRequest();
        request.open("get", url);
        request.onload = function(e) {
            res(request.responseText);
        };
        request.onerror = function(e) {
            rej(request.statusText);
        };
        request.send();
    });
};

function DomExtensions() {}

DomExtensions.createDomFromStr = function(str) {
    var div = document.createElement("div");
    div.innerHTML = str;
    return div;
};

function HabrPostParser() {
}

HabrPostParser.prototype._getLastPageNumber = function() {
	var navPagess = document.getElementById("nav-pagess");
	if(!navPagess) return 1;
    var paginationElems = navPagess
        .querySelectorAll(".toggle-menu__item-link.toggle-menu__item-link_pagination");
    var lastPaginationElem = paginationElems[paginationElems.length - 1];
    var urlLastPage = lastPaginationElem.tagName === "A" 
        ? lastPaginationElem.href
        : location.href;
    var lastPageNumber = new RegExp(/page([0-9]+)/).exec(urlLastPage)[1];
    return lastPageNumber;
};

HabrPostParser.prototype._getPageUrl = function(pageNumber) {
    var curLocationHref = location.href;
    var pageRegExp = new RegExp(/page[0-9]+(?=\/?)/);
    var pageAndNumber = "page" + pageNumber;
    var pageUrl = pageRegExp.test(curLocationHref) 
        ? curLocationHref.replace(pageRegExp, pageAndNumber) 
        : curLocationHref + pageAndNumber;
    return pageUrl;
};

HabrPostParser.prototype._postDateParse = function(date) {
    if(~date.indexOf("сегодня в")) {
        var curDate = new Date();
        var replacedDate = date.replace("сегодня в",
            curDate.getFullYear() + "/" + curDate.getMonth() + "/" + curDate.getDate());
        date = new Date(Date.parse(replacedDate));
    } else if(~date.indexOf("вчера в")) {
        var yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        var replacedDate = date.replace("вчера в",
            yesterday.getFullYear() + "/" + yesterday.getMonth() + "/" + yesterday.getDate());
        date = new Date(Date.parse(replacedDate));
    } else {
        var monthConversion = {
            "января в": 1,
            "февраля в": 2,
            "марта в": 3,
            "апреля в": 4,
            "мая в": 5,
            "июня в": 6,
            "июля в": 7,
            "августа в": 8,
            "сентября в": 9,
            "октября в": 10,
            "ноября в": 11,
            "декабря в": 12
        };
        var parsedDate = new RegExp(/([0-9]+) (.+?) ([0-9]{1,2}:[0-9]{1,2})/).exec(date);
        var d = parsedDate[1];
        var month = monthConversion[parsedDate[2]];
        var time = parsedDate[3];
        date = new Date(Date.parse(new Date().getFullYear() + "/" + month + "/" + d + " " + time));
    }
    return date;
};

HabrPostParser.prototype._postTeaserParse = function(post) {
    var content = post.outerHTML;
    var url = post.getElementsByClassName("post__title_link")[0].href;
    var datePublish = this._postDateParse(post.getElementsByClassName("post__time_published")[0].textContent);
    return {
        content: content,
        url: url,
        datePublish: datePublish
    };
};  

HabrPostParser.prototype._pageParse = function(page) {
    var parsedPosts = Array.prototype.map
        .call(page.querySelectorAll(".post.post_teaser"),
            this._postTeaserParse.bind(this));
    return parsedPosts;
};

HabrPostParser.prototype.parse = function() {
    var countPages = this._getLastPageNumber();
    var urls = Array.apply(null, { length: countPages })
        .map((item, index) => this._getPageUrl(index + 1));
    return Promise.all(urls.map(ContentFeatcher.getResult))
        .then(results => results
            .map(DomExtensions.createDomFromStr)
            .map(this._pageParse.bind(this))
            .reduce((cur, prev) => prev.concat(cur), []));
};

var locaitonIsPost = [ "/post/", "/blog/" ]
    .some(item => ~location.href.indexOf(item));

var postMarker = new PostMarker();

if(locaitonIsPost) {
    var curLocation = location.href;
    if(!~postMarker.importantPosts.indexOf(curLocation))
    	postMarker.readPost(curLocation);
} else {
	var habrPostParser = new HabrPostParser();
    var parsedPosts = habrPostParser.parse()
        .then(result => {
            var pageFooter = document.getElementsByClassName("page__footer")[0];
            pageFooter.parentElement.removeChild(pageFooter);

            var notReadedPosts = result
                .filter(item => !~postMarker.readedPosts.indexOf(item.url))
                .sort((a, b) => a.datePublish > b.datePublish ? -1 : a.datePublish < b.datePublish ? 1 : 0)
                .map(item => { 
                	var elem = DomExtensions.createDomFromStr(item.content).firstElementChild; 
                	if(~postMarker.importantPosts.indexOf(item.url))
                		elem.style.border = "1px solid red";
                	return elem;
                })
                .reduce((prev, cur) => { prev.appendChild(cur); return prev; },
                    document.createDocumentFragment());
            var postsContainer = document.querySelector(".posts.shortcuts_items");
            postsContainer.innerHTML = "";
            postsContainer.appendChild(notReadedPosts);
        })
        .then(() => {
        	Array.prototype.slice.call(document.querySelectorAll(".post.post_teaser"))
        		.forEach(function(postTeaser) {
        	    	var postHeader = postTeaser.getElementsByClassName("post__header")[0];
        	    	var postTitle = postHeader.getElementsByClassName("post__title")[0];
        	    	var postLink = postHeader.getElementsByClassName("post__title_link")[0];

        	    	var readedBtn = document.createElement("button");
        	    	readedBtn.style.float = "right";
        	    	readedBtn.textContent = "Readed";
        	    	readedBtn.addEventListener("click", function() {
        	    		postMarker.readPost(postLink.href);
        	    		postTeaser.parentElement.removeChild(postTeaser);
        	    	});
        	    	postHeader.insertBefore(readedBtn, postTitle);

        	    	var importantBtn = document.createElement("button");
        	    	importantBtn.style.float = "right";
        	    	importantBtn.textContent = "Important";
        	    	importantBtn.addEventListener("click", function() {
        	    		postMarker.importantPost(postLink.href);
        	    		postTeaser.style.border = "1px solid red";
        	    	})
        	    	postHeader.insertBefore(importantBtn, readedBtn);
        		});
        });
}