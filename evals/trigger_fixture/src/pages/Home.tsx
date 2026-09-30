import React from "react";

const images = ["/img/a.jpg", "/img/b.jpg", "/img/c.jpg"];

export function Home() {
  return <main><h1>Welcome</h1><div className="carousel"><img src={images[0]} alt="" /></div></main>;
}
