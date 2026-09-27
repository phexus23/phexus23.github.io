fetch('../json/list.json')
  .then(response => response.json())
  .then(data => {
    const gxmes = data.length;
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    let index = dayOfYear % gxmes;
    while (data[index] && data[index].missing) index = (index + 1) % gxmes;
    //console.log("Day of Year:", dayOfYear, "Index:", index);

    const item = data[index];
    const name1 = item.name;
    const imgsrc = item.imgsrc;
    const src = item.linksrc;

    console.log("name", name1);
    console.log("src", src);
  })
  .catch(error => console.error('Error:', error));
