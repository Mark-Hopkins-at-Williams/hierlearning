import { useState, useEffect, React } from 'react'
import EnglishParser from './components/EnglishParser'
import Switch from "react-switch";



const App = () => {
  
  const cssDay = `
    .definition { padding: 10px; color: white; background-color: #201b71;}
    .definitionheader {color:aqua; font-weight: bold}
    .header1 {color:#7ab3d9;}
    .rightbg {background-color: #F0F0F0;} 
    .leftbg {background-color: #E3D79F;} 
    .logotitlecolor {color: #006298}
    .logosubtitlecolor {color: black;}
    .textcolor { color: rgb(80, 80, 80); }
    .term {color:#e8641a;}
    a {color: #0062a8; text-decoration: none; font-family: 'Futura', 'Trebuchet MS', sans-serif;}
    ol { color: rgb(80, 80, 80); }
    li > a:hover { color: #e8641a;}
    .image {border: 2px solid #0062a8;}
    hr {height: 1px; color: black; background: black;}
    a:hover {color: #e8641a;}
    a.menu {color: rgb(13, 12, 12);}
    
  `
  const cssNight = `
    .definition { padding: 10px; color: white; background-color: #ef7358;}
    .definitionheader {color:maroon; font-weight: bold}
    .header1 {color:aqua;}
    .leftbg {background-color: #3C4046;}
    .rightbg {background-color: #35383d;}
    .logotitlecolor {color: #E3D79F;}
    .logosubtitlecolor {color: white;}
    .textcolor { color: white; }
    .term {color:aqua;}
    a {color: #f88379; text-decoration: none; font-family: 'Futura', 'Trebuchet MS', sans-serif;}
    ol { color: white; }
    li > a:hover { color: aqua; }
    .image {border: 2px solid #81c8cd;}
    hr {height: 0.5px; color: aqua; background: aqua;}
    a:hover {color: red;}
    a.menu {color: grey;}
  `
  const [checked, setChecked] = useState(true)
  const [css, setCss] = useState(cssNight)
  const [goodcolor, setGoodcolor] = useState("chartreuse")
  const [badcolor, setBadcolor] = useState("red")
  const [labelcolor, setLabelcolor] = useState("#e28a24")

  useEffect(()=>{
    setCss(cssDay);
    setGoodcolor("chartreuse");
    setBadcolor("red");
    setLabelcolor("#e28a24")
  }, []) 

  const handleChange = () => {
    setChecked(!checked);
    if(checked) {
      setCss(cssNight);
      setGoodcolor("aqua");
      setBadcolor("red");
      setLabelcolor("#E3D79F")
    } else {
      setCss(cssDay);
      setGoodcolor("chartreuse");
      setBadcolor("red");
      setLabelcolor("#e69a34")
    }
  }

  return <div className="rightbg" style={{ minHeight: '100vh', background: '#27292a' }}>
          <style>{css}</style>
          <EnglishParser />
        </div>;
};

export default App;
